/**
 * Resultado explícito para operações que podem falhar por motivos esperados
 * (save corrompido, id inexistente...). Evita try/catch espalhado e força o
 * chamador a tratar o erro.
 */
export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E = string> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });
