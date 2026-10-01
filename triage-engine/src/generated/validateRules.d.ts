export interface AjvErrorLike { instancePath: string; message?: string; keyword: string; params: Record<string, unknown> }
declare const validate: ((data: unknown) => boolean) & { errors?: AjvErrorLike[] | null }
export default validate
export { validate }
