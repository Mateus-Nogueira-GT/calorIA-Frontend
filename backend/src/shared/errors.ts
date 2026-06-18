export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const errors = {
  unauthorized: () => new AppError(401, 'UNAUTHORIZED', 'Não autorizado'),
  forbidden: () => new AppError(403, 'FORBIDDEN', 'Acesso negado'),
  notFound: (resource: string) => new AppError(404, 'NOT_FOUND', `${resource} não encontrado`),
  conflict: (message: string) => new AppError(409, 'CONFLICT', message),
  unprocessable: (message: string) => new AppError(422, 'UNPROCESSABLE_ENTITY', message),
  internal: (message = 'Erro interno do servidor') =>
    new AppError(500, 'INTERNAL_SERVER_ERROR', message),
}
