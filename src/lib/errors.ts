/**
 * AppError = a business-rule failure whose message is safe to show the user.
 *   throw new AppError("Only confirmed bookings can be assigned.")          // 400
 *   throw new NotFoundError("Booking")                                      // 404
 *   throw new ConflictError("This booking is already delivered.")           // 409
 */
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(what = "Record") {
    super(`${what} not found.`, 404);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
    this.name = "ConflictError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have permission to do this.") {
    super(message, 403);
    this.name = "ForbiddenError";
  }
}

/** Invalid input — carries per-field messages for forms / API clients. */
export class ValidationError extends AppError {
  constructor(public fieldErrors: Record<string, string[] | undefined>) {
    super("Please check the highlighted fields.", 400);
    this.name = "ValidationError";
  }
}

type MySqlError = { code?: string; errno?: number; sqlMessage?: string };

/** Friendly messages for UNIQUE keys in care_booking_schema.sql */
const UNIQUE_KEY_MESSAGES: Record<string, string> = {
  uq_bookings_busy: "This employee is already booked on that date.",
  uq_users_email: "A user with this email already exists.",
  uq_branches_code: "A branch with this code already exists.",
  uq_employees_emp_no: "This employee number is already used.",
  uq_employees_nic: "An employee with this NIC is already registered.",
  uq_hospitals_name_city: "This hospital is already registered in that city.",
  uq_invoices_booking: "An invoice already exists for this booking.",
  uq_packages_name: "A package with this name already exists.",
};

function findMySqlError(err: unknown): MySqlError | null {
  // Drizzle wraps driver errors; walk the .cause chain to find the mysql2 error.
  let current: unknown = err;
  for (let i = 0; i < 5 && current; i++) {
    const e = current as MySqlError & { cause?: unknown };
    if (typeof e.errno === "number" && e.code) return e;
    if (e.code === "ECONNREFUSED") return e;
    current = e.cause;
  }
  return null;
}

/** Any thrown error → HTTP status + message that is safe to show. */
export function describeError(err: unknown): { status: number; message: string } {
  if (err instanceof AppError) return { status: err.status, message: err.message };

  const db = findMySqlError(err);
  if (db) {
    switch (db.code) {
      case "ER_DUP_ENTRY": {
        const key = db.sqlMessage?.match(/for key '(?:[\w]+\.)?(\w+)'/)?.[1];
        return { status: 409, message: (key && UNIQUE_KEY_MESSAGES[key]) || "This record already exists." };
      }
      case "ER_ROW_IS_REFERENCED_2":
        return { status: 409, message: "This record is used elsewhere and cannot be deleted. Deactivate it instead." };
      case "ER_NO_REFERENCED_ROW_2":
        return { status: 400, message: "A linked record (branch, customer, employee…) was not found." };
      case "ECONNREFUSED":
        return { status: 503, message: "Cannot reach the database. Please try again shortly." };
    }
  }

  console.error("[unexpected error]", err);
  return { status: 500, message: "Something went wrong. Please try again." };
}

export function toUserMessage(err: unknown): string {
  return describeError(err).message;
}
