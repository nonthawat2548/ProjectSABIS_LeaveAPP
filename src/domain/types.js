// @ts-check
// Data contracts for editor hints and checks; no runtime data.
/**
 * @typedef {'Employee' | 'Manager' | 'HR'} Role
 */
/**
 * @typedef {'Pending' | 'Approved' | 'Rejected' | 'Withdrawn'} RequestStatus
 */
/**
 * @typedef {'Full' | 'AM' | 'PM'} Duration
 */
/**
 * @typedef {object} Employee
 * @property {number} id
 * @property {string} name
 * @property {'Male' | 'Female' | 'Other'} gender
 * @property {string} email
 * @property {string} phone
 * @property {string} position
 * @property {Role} role
 * @property {number | null} managerId
 * @property {string} department
 * @property {boolean} active
 */
/**
 * @typedef {object} LeaveType
 * @property {number} id
 * @property {string} name
 * @property {'Annual' | 'Pregnancy'} quotaScope
 * @property {number} defaultQuotaDays
 * @property {'Working Days' | 'Calendar Days'} dayCountBasis
 * @property {number} advanceNoticeDays
 * @property {number | null} documentRequiredFromDays
 * @property {string | null} requiredDocumentType
 * @property {Employee['gender'] | null} eligibleGender
 */
/**
 * @typedef {object} Entitlement
 * @property {number} id
 * @property {number} employeeId
 * @property {number} leaveTypeId
 * @property {number} year
 * @property {number} grantedDays
 */
/**
 * @typedef {object} MaternityCase
 * @property {number} id
 * @property {number} employeeId
 * @property {number} caseNo
 * @property {number} maximumDays
 */
/**
 * @typedef {object} TimelineEvent
 * @property {string} action
 * @property {number} actorId
 * @property {string} at
 * @property {string} comment
 */
/**
 * @typedef {object} LeaveRequest
 * @property {number} id
 * @property {number} employeeId
 * @property {number} leaveTypeId
 * @property {number | null} maternityCaseId
 * @property {string} startDate
 * @property {string} endDate
 * @property {string} reason
 * @property {string} requestDate
 * @property {RequestStatus} status
 * @property {Duration} duration
 * @property {number} version
 * @property {TimelineEvent[]} timeline
 */
/**
 * @typedef {object} LeaveDay
 * @property {number} id
 * @property {number} leaveId
 * @property {string} date
 * @property {number | null} entitlementId
 * @property {number} units
 */
/**
 * @typedef {object} LeaveDocument
 * @property {number} id
 * @property {number} leaveId
 * @property {string} documentType
 * @property {string} fileName
 * @property {string} storageKey
 * @property {string} fileType
 * @property {number} fileSize
 * @property {string} uploadedAt
 * @property {string} dataUrl
 * @property {boolean} [remote]
 */
/**
 * @typedef {object} LeaveApproval
 * @property {number} id
 * @property {number} leaveId
 * @property {number} approverId
 * @property {number} stepNo
 * @property {'Manager' | 'HR'} reviewRole
 * @property {'Decision' | 'Consultation'} reviewType
 * @property {'Pending' | 'Approved' | 'Rejected' | 'Completed'} status
 * @property {string} comment
 * @property {string} assignedAt
 * @property {string | null} reviewedAt
 * @property {boolean} [cancelled]
 */
/**
 * @typedef {object} WorkStatus
 * @property {number} id
 * @property {number} employeeId
 * @property {string} date
 * @property {'In-office' | 'WFH' | 'Outside'} statusType
 * @property {string} updatedAt
 */
/**
 * @typedef {object} ColleagueStatus
 * @property {number} employeeId
 * @property {string} name
 * @property {string} position
 * @property {string} department
 * @property {string} date
 * @property {WorkStatus['statusType'] | null} workStatus
 * @property {Duration | null} leaveDuration
 * @property {string | null} updatedAt
 */
/**
 * @typedef {object} Notification
 * @property {number} id
 * @property {number} employeeId
 * @property {number | null} leaveId
 * @property {string} text
 * @property {string} createdAt
 * @property {boolean} read
 */
/**
 * @typedef {object} Holiday
 * @property {string} date
 * @property {string} name
 */
/**
 * @typedef {object} Database
 * @property {1} schemaVersion
 * @property {Employee[]} employees
 * @property {LeaveType[]} leaveTypes
 * @property {Entitlement[]} entitlements
 * @property {MaternityCase[]} maternityCases
 * @property {LeaveRequest[]} requests
 * @property {LeaveDay[]} days
 * @property {LeaveDocument[]} documents
 * @property {LeaveApproval[]} approvals
 * @property {WorkStatus[]} workStatuses
 * @property {Notification[]} notifications
 * @property {Holiday[]} holidays
 */
/**
 * @typedef {object} AttachmentInput
 * @property {string} fileName
 * @property {string} fileType
 * @property {number} fileSize
 * @property {string} dataUrl
 */
/**
 * @typedef {object} RequestInput
 * @property {number} leaveTypeId
 * @property {number | null} maternityCaseId
 * @property {string} startDate
 * @property {string} endDate
 * @property {Duration} duration
 * @property {string} reason
 * @property {AttachmentInput | null} [attachment]
 * @property {boolean} [keepDocument]
 */
/**
 * @typedef {object} Balance
 * @property {number} total
 * @property {number} used
 * @property {number} remaining
 * @property {number} pending
 */
/**
 * @typedef {{ type: 'submit', input: RequestInput }} SubmitCommand
 * @typedef {{ type: 'edit', id: number, version: number, input: RequestInput }} EditCommand
 * @typedef {{ type: 'withdraw', id: number, version: number }} WithdrawCommand
 * @typedef {{ type: 'approve', id: number, version: number, comment: string }} ApproveCommand
 * @typedef {{ type: 'reject', id: number, version: number, comment: string }} RejectCommand
 * @typedef {{ type: 'refer', id: number, version: number, comment: string, hrId: number }} ReferCommand
 * @typedef {{ type: 'consult', id: number, version: number, comment: string }} ConsultCommand
 * @typedef {{ type: 'work', date: string, statusType: WorkStatus['statusType'] }} WorkCommand
 * @typedef {{ type: 'readNotifications' }} ReadNotificationsCommand
 * @typedef {{ type: 'entitlement', employeeId: number, leaveTypeId: number, year: number, grantedDays: number }} EntitlementCommand
 * @typedef {{ type: 'maternity', employeeId: number, maximumDays: number }} MaternityCommand
 * @typedef {{ type: 'holiday', date: string, name: string, remove?: boolean }} HolidayCommand
 * @typedef {{ type: 'policy', policy: LeaveType }} PolicyCommand
 * @typedef {{type: 'sendLeaveReport', employeeId: number, hrId: number, year: number, month: number, leaveTypeId: number}} SendLeaveReportCommand
 * @typedef {SubmitCommand | EditCommand | WithdrawCommand | ApproveCommand | RejectCommand | ReferCommand | ConsultCommand | WorkCommand | ReadNotificationsCommand | EntitlementCommand | MaternityCommand | HolidayCommand | PolicyCommand | SendLeaveReportCommand} Command
 */
/**
 * @typedef {object} CommandResult
 * @property {number} [id]
 * @property {string} message
 */
/**
 * @typedef {object} EmployeeProfile
 * @property {Employee} employee
 * @property {Pick<Employee, 'id' | 'name'> | null} manager
 */
/**
 * @typedef {object} LeaveRepository
 * @property {(identifier: string, password: string) => Promise<Employee>} login
 * @property {() => Promise<Employee | null>} session
 * @property {() => Promise<void>} logout
 * @property {() => Promise<Database>} snapshot
 * @property {(employeeId: number) => Promise<EmployeeProfile>} getEmployeeProfile
 * @property {(query: string, date: string) => Promise<ColleagueStatus[]>} searchColleagues
 * @property {(command: Command) => Promise<CommandResult>} execute
 * @property {(document: LeaveDocument) => Promise<Blob>} [downloadDocument]
 * @property {() => Promise<void>} resetDemo
 */

export {};
