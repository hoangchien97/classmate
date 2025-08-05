enum DayOfWeek {
  SUNDAY = 0,
  MONDAY = 1,
  TUESDAY = 2,
  WEDNESDAY = 3,
  THURSDAY = 4,
  FRIDAY = 5,
  SATURDAY = 6,
}

enum RecurrenceType {
  NONE = "none",
  WEEKLY = "weekly", 
  MONTHLY = "monthly",
}

enum ClassStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
}

export { DayOfWeek, RecurrenceType, ClassStatus };