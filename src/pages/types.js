// @ts-check
// Data contracts for editor hints and checks; no runtime data.
/**
 * @typedef {import('../domain/types.js').Command} Command
 * @typedef {import('../domain/types.js').CommandResult} CommandResult
 * @typedef {import('../domain/types.js').Database} Database
 * @typedef {import('../domain/types.js').Employee} Employee
 */
/**
 * @typedef {object} PageProps
 * @property {Database} db
 * @property {Employee} actor
 * @property {(c: Command) => Promise<CommandResult>} run
 * @property {() => Promise<void>} reload
 */

export {};
