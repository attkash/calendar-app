import fs from 'fs';

const p = 'client/src/components/ApplicationForm.tsx';
let s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const start = s.indexOf('MARKER_DELETE_START');
const gridIdx = s.indexOf(
  '<div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(12.5rem,15.5rem)]'
);

if (start === -1 || gridIdx === -1) {
  console.error('markers', { start, gridIdx });
  process.exit(1);
}

s = s.slice(0, start) + '\n              ' + s.slice(gridIdx);

s = s.replace(
  '{wizardStep === 2 && (\n          <Card className="p-6 lg:p-8">\n            <CardHeader className="p-0 pb-4">\n              <CardTitle className="text-xl">PDF layout</CardTitle>',
  '{wizardStep === 2 && (\n            <>\n          <Card className="p-6 lg:p-8">\n            <CardHeader className="p-0 pb-4">\n              <CardTitle className="text-xl">PDF layout</CardTitle>'
);

s = s.replace(
  /(<\/Card>\n            \)\}\n\n            \{wizardStep === 3 && \()/,
  '</Card>\n            </>\n            )}\n\n            {wizardStep === 3 && ('
);

s = s.replace(
  '{wizardStep === 3 && (\n          {/* Months Section */}',
  '{wizardStep === 3 && (\n            <>\n          {/* Months Section */}'
);

const holidaysCard = `          <Card className="p-6 lg:p-8">
            <CardHeader className="p-0 pb-4">
              <CardTitle className="text-xl">Holidays &amp; celebrations</CardTitle>
              <CardDescription className="text-base">
                Optional sets of public and religious dates. In the PDF they are listed in <strong>red</strong> at the bottom of
                the day cell, with your own dates. Islamic and Jewish dates are approximate; extend years in
                <code className="mx-1 text-sm bg-surface border border-border px-1 py-0.5 rounded">holidays.js</code> on the server if needed.
              </CardDescription>
              <p
                className="mt-3 rounded-lg border border-orange-200 bg-warning-bg px-3 py-2.5 text-sm font-semibold leading-snug text-warning"
                role="note"
              >
                ATTENTION! Religious days rules are only as accurate as the precomputed range.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {HOLIDAY_CALENDAR_OPTIONS.map((opt) => (
                  <label
                    key={opt.id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-input p-3 shadow-sm text-left hover:border-accent/40 hover:bg-accent/5"
                  >
                    <input
                      type="checkbox"
                      checked={holidayCalendars.includes(opt.id)}
                      onChange={() => toggleHolidayCalendar(opt.id)}
                      className="mt-0.5 size-4 shrink-0 rounded border-border bg-input text-accent shadow-sm focus:ring-2 focus:ring-accent/40"
                    />
                    <span className="text-sm text-muted-foreground leading-snug">{opt.label}</span>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
`;

s = s.replace(
  '{wizardStep === 4 && (\n          {/* Events Section */}\n          <Card',
  `{wizardStep === 4 && (\n            <>\n${holidaysCard}\n          {/* Events Section */}\n          <Card`
);

s = s.replace(
  /(<\/Card>\n            \)\}\n\n            \{wizardStep === 5 && \()/,
  '</Card>\n            </>\n            )}\n\n            {wizardStep === 5 && ('
);

s = s.replace(
  'Saves dates and design (fonts, layout, week start, Pictures folder path) — not month photos.',
  'Saves design (fonts, layout, week start, Pictures folder path) — not personal dates or month photos.'
);

fs.writeFileSync(p, s);
console.log('done');
