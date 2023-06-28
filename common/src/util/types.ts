import { Column, Row, Selectable } from 'common/supabase/utils'

type SnakeToCamel<S extends string> = S extends `${infer T}_${infer U}`
  ? `${Lowercase<T>}${Capitalize<SnakeToCamel<U>>}`
  : S

const camelize = <S extends string>(s: S) =>
  s.replace(/(_\w)/g, (m) => m[1].toUpperCase()) as SnakeToCamel<S>

// sql column ->  converter function or false
type TypeConverter<R extends Selectable, T extends Record<string, any>> = {
  [key in Column<R>]?: SnakeToCamel<key> extends keyof T
    ? ((r: Row<R>[key]) => T[SnakeToCamel<key>]) | false
    : false
}

/**
 * Convert a sql row to its frontend data type.
 * Changes snake_case to camelCase.
 * You can also specify conversion functions for each column, or set it to false to filter it.
 */
export const mapTypes = <R extends Selectable, T extends Record<string, any>>(
  sqlData: Partial<Row<R> & { data: any }>,
  converters: TypeConverter<R, T>
) => {
  const { data = {}, ...rows } = sqlData

  const entries = Object.entries(rows)

  const m = entries
    .map((entry) => {
      const [key, val] = entry as [Column<R>, Row<R>[Column<R>]]

      const convert = converters[key]
      if (convert === false) return null
      return [camelize(key), convert?.(val) ?? val]
    })
    .filter((x) => x != null)

  const newRows = Object.fromEntries(m as any)

  return { ...data, ...newRows } as T
}
