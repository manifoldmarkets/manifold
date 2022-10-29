export class UserNotRegisteredException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'UserNotRegisteredException';
  }
}
export class InsufficientBalanceException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'InsufficientBalanceException';
  }
}
export class ForbiddenException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'ForbiddenException';
  }
}
export class ResourceNotFoundException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'ResourceNotFoundException';
  }
}
export class TradingClosedException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'TradingClosedException';
  }
}
