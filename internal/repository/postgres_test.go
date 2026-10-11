package repository

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"testing"
)

// An isolated wire-protocol fixture discards prepared statements between transactions,
// reproducing what a transaction pooler can do when it changes PostgreSQL connections.
func TestPostgresTransactionPooler(t *testing.T) {
	dsn := os.Getenv("GO_TEST_POSTGRES_URL")
	if dsn == "" {
		t.Skip("run npm run test:go:postgres for the isolated PostgreSQL wire fixture")
	}
	ctx := context.Background()
	store, err := OpenPostgres(ctx, dsn, "", true)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	clearPrepared := func(s *PostgresStore) {
		t.Helper()
		conn, err := s.pool.Acquire(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer conn.Release()
		if _, err = conn.Exec(ctx, "DEALLOCATE ALL", pgx.QueryExecModeSimpleProtocol); err != nil {
			t.Fatal(err)
		}
	}
	read := func(s *PostgresStore) error {
		return s.Transaction(ctx, false, func(tx Tx) error { return tx.Ready() })
	}

	// The old/default driver mode must fail, so this fixture catches the production risk.
	cfg := store.pool.Config()
	cfg.MaxConns = 1
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeCacheStatement
	cfg.ConnConfig.StatementCacheCapacity = 512
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	control := &PostgresStore{pool: pool}
	if err = read(control); err != nil {
		control.Close()
		t.Fatal(err)
	}
	clearPrepared(control)
	var postgresError *pgconn.PgError
	if err = read(control); !errors.As(err, &postgresError) || postgresError.Code != "26000" {
		control.Close()
		t.Fatalf("cached statements should reproduce SQLSTATE 26000, got %v", err)
	}
	control.Close()

	// The application mode must continue reading successfully after every switch.
	for i := 0; i < 5; i++ {
		if err = store.Transaction(ctx, false, func(tx Tx) error {
			if err := tx.Ready(); err != nil {
				return err
			}
			session, err := tx.Session("missing' OR '1'='1")
			if session != nil {
				t.Fatal("a quoted parameter must not select a session")
			}
			return err
		}); err != nil {
			t.Fatalf("transaction %d after statement reset: %v", i, err)
		}
		clearPrepared(store)
	}
}
