import { AppError } from '../../shared/errors.js'

function allSame(d: string) {
  return /^(\d)\1+$/.test(d)
}

export function isValidCpf(d: string): boolean {
  if (!/^\d{11}$/.test(d) || allSame(d)) return false
  const digit = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i)
    const r = (sum * 10) % 11
    return r === 10 ? 0 : r
  }
  return digit(9) === Number(d[9]) && digit(10) === Number(d[10])
}

export function isValidCnpj(d: string): boolean {
  if (!/^\d{14}$/.test(d) || allSame(d)) return false
  const digit = (len: number) => {
    const weights =
      len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0)
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  return digit(12) === Number(d[12]) && digit(13) === Number(d[13])
}

/** Só dígitos, com dígitos verificadores conferidos. O valor vai ao Asaas e não é gravado. */
export function normalizeCpfCnpj(input: string): string {
  const digits = input.replace(/[.\-/\s]/g, '')
  if ((digits.length === 11 && isValidCpf(digits)) || (digits.length === 14 && isValidCnpj(digits)))
    return digits
  throw new AppError(422, 'INVALID_DOCUMENT', 'Confira o CPF ou CNPJ informado.')
}
