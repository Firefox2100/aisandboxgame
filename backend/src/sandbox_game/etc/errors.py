class SandboxGameException(Exception):
    def __init__(self,
                 message: str,
                 status_code: int = 500,
                 ):
        super().__init__(message)

        self.message = message
        self.status_code = status_code


class AuthenticationError(SandboxGameException):
    def __init__(self,
                 message: str,
                 status_code: int = 401,
                 ):
        super().__init__(message, status_code)


class UserNotFound(SandboxGameException):
    def __init__(self,
                 username: str,
                 ):
        super().__init__(
            message=f'User with username {username} not found.',
            status_code=404,
        )
