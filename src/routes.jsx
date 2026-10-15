import { Link, useParams, useRoutes } from 'react-router-dom';
import { Heading } from './components.jsx';
import { ColleaguesPage } from './ColleaguesPage.jsx';
import { ManagementAnalytics } from './ManagementAnalytics.jsx';
import { EmployeeProfilePage } from './pages/EmployeeProfilePage.jsx';
import {
  AdminPage,
  CalendarPage,
  Dashboard,
  LeaveForm,
  LeaveSummaryPage,
  LeaveReportDashboardPage,
  NotificationsPage,
  Quotas,
  RequestDetail,
  Requests,
  SettingsPage,
  WorkPage,
} from './pages.jsx';

function NotFound() {
  return (
    <>
      <Heading title="ไม่พบหน้าหรือไม่มีสิทธิ์เข้าถึง" />
      <Link className="btn primary" to="/dashboard">
        กลับหน้าหลัก
      </Link>
    </>
  );
}

function RequestRoute({ pageProps, edit = false }) {
  const { id } = useParams();
  if (!/^\d+$/.test(id)) return <NotFound />;
  return edit ? (
    <LeaveForm {...pageProps} editId={Number(id)} />
  ) : (
    <RequestDetail {...pageProps} id={Number(id)} />
  );
}

function EmployeeProfileRoute({ pageProps }) {
  const { id } = useParams();
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1) return <NotFound />;
  return <EmployeeProfilePage {...pageProps} employeeId={Number(id)} />;
}

function LeaveReportRoute({ pageProps }) {
  const { id } = useParams();
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1) return <NotFound />;
  return <LeaveReportDashboardPage {...pageProps} notificationId={Number(id)} />;
}

// Page access is a presentation rule. The repository and Go API also check rights.
export function createWorkspaceRoutes(props) {
  const employee = props.actor.role === 'Employee';
  const hr = props.actor.role === 'HR';
  const routes = [
    { path: '/', title: 'หน้าหลัก', element: <Dashboard {...props} /> },
    { path: '/dashboard', title: 'หน้าหลัก', element: <Dashboard {...props} /> },
    {
      path: '/leave-summary',
      title: hr ? 'แดชบอร์ด' : 'สรุปการลา',
      element: hr ? (
        <div className="dashboard-page hr-dashboard-page">
          <ManagementAnalytics {...props} />
        </div>
      ) : (
        <LeaveSummaryPage {...props} />
      ),
    },
    {
      path: '/requests',
      title: employee ? 'ประวัติคำขอ' : hr ? 'คำขอปรึกษา HR' : 'รายการคำขอของทีม',
      element: <Requests {...props} />,
    },
    { path: '/request/:id', title: 'รายละเอียดคำขอ', element: <RequestRoute pageProps={props} /> },
    { path: '/work', title: 'สถานะการทำงาน', element: <WorkPage {...props} /> },
    { path: '/colleagues', title: 'สถานะเพื่อนร่วมงาน', element: <ColleaguesPage {...props} /> },
    {
      path: '/employee/:id',
      title: 'ประวัติพนักงาน',
      element: <EmployeeProfileRoute pageProps={props} />,
    },
    { path: '/notifications', title: 'การแจ้งเตือน', element: <NotificationsPage {...props} /> },
  ];
  routes.push({ path: '/quota', title: 'สิทธิ์และโควตา', element: <Quotas {...props} /> });
  if (!hr)
    routes.push(
      { path: '/new', title: 'ยื่นคำขอลา', element: <LeaveForm {...props} /> },
      {
        path: '/request/:id/edit',
        title: 'รายละเอียดคำขอ',
        element: <RequestRoute pageProps={props} edit />,
      },
    );
  if (!employee)
    routes.push({ path: '/calendar', title: 'ปฏิทินการลา', element: <CalendarPage {...props} /> });
  if (!employee)
    routes.push({
      path: '/leave-report/:id',
      title: 'รายงานสรุปการลา',
      element: <LeaveReportRoute pageProps={props} />,
    });
  if (hr)
    routes.push(
      {
        path: '/approvals',
        title: 'อนุมัติคำขอผู้จัดการ',
        element: <Requests {...props} decisionsOnly />,
      },
      { path: '/admin', title: 'ข้อมูลและสิทธิ์การลา', element: <AdminPage {...props} /> },
      { path: '/settings', title: 'การตั้งค่า', element: <SettingsPage {...props} /> },
    );
  if (!employee)
    routes.push({
      path: '/my-requests',
      title: 'ประวัติคำขอของฉัน',
      element: <Requests {...props} personal />,
    });
  routes.push({ path: '*', title: 'ไม่พบหน้า', element: <NotFound /> });
  return routes;
}

export function WorkspaceRoutes({ routes }) {
  return useRoutes(routes);
}
