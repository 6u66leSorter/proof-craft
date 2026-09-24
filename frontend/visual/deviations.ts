/**
 * Согласованные визуальные отклонения нового клиента от legacy: снимки, которые меняются
 * из-за исправленного дефекта legacy. Для них новый клиент сравнивается с собственным эталоном
 * `__screenshots__/<project>/deviations/<name>.png`, а legacy — по-прежнему с исходным.
 * Каждое отклонение описано в docs/migration/FRONTEND_PLAN.md.
 */
export const VISUAL_DEVIATIONS: Record<string, string> = {
  'student-homework-new-error':
    'Legacy стирает введённые номер, название и описание при перерисовке после ошибки отправки; новый клиент их сохраняет.',
}
