import fs from 'fs';

const p = 'client/src/components/ApplicationForm.tsx';
let s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// Remove standalone import card before form
s = s.replace(
  /\n        <Card className="p-5 lg:p-6 mb-8 border-accent\/30">[\s\S]*?Import dates from a previous calendar PDF[\s\S]*?<\/Card>\n\n        <form/,
  '\n        <form'
);

// Remove save block inside form
const saveRe =
  /\n          \{requireAuth \? \(\n            <Card className="p-4 lg:p-5">[\s\S]*?Save to your account[\s\S]*?<\/Card>\n          \) : null\}\n\n/;
const saveMatch = s.match(saveRe);
const saveBlock = saveMatch ? saveMatch[0] : '';
s = s.replace(saveRe, '\n\n');

// Open CalendarWizard after presetLoading block
const presetRe =
  /(\{presetLoading && \([\s\S]*?\)\}\n+)/;
if (!presetRe.test(s)) {
  console.error('preset block not found');
  process.exit(1);
}

const wizardOpen = `$1          <CalendarWizard
            step={wizardStep}
            totalSteps={WIZARD_STEP_COUNT}
            onStepClick={goToWizardStep}
            onBack={() => goToWizardStep(wizardStep - 1)}
            onNext={() => goToWizardStep(wizardStep + 1)}
            isSubmitting={isSubmitting}
            isGeneratingFree={isGeneratingFree}
            onFreePdf={() => void handleFreeGenerate()}
          >
`;

s = s.replace(presetRe, wizardOpen);

const step1 = `            {wizardStep === 1 && (
              <STEP1OUTER className="space-y-6">
                <STEP1INNER className="text-center space-y-3 py-2 sm:py-4">
                  <h2 className="text-2xl sm:text-3xl font-semibold">Getting started</h2>
                  <p className="text-muted-foreground leading-relaxed max-w-lg mx-auto">
                    <strong className="text-foreground">First time here?</strong> Click <strong className="text-foreground">Next</strong> to continue.
                  </p>
                  <p className="text-muted text-sm leading-relaxed max-w-lg mx-auto">
                    <strong className="text-foreground">Returning user?</strong> Upload your previous calendar PDF to restore personal dates.
                  </p>
                </STEP1INNER>
                <Card className="border-accent/30 bg-surface/40">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2"><FileUp className="size-5 text-accent shrink-0" />Import previous PDF</CardTitle>
                    <CardDescription className="text-sm">Dates are stored inside the PDF only.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <input ref={importPdfInputRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={handleImportPdfInputChange} />
                    <Button type="button" variant="outline" className="h-11" disabled={importingPdf} onClick={() => importPdfInputRef.current?.click()}>
                      {importingPdf ? <ButtonBusyLabel status="Reading PDF…" /> : <><FileUp className="size-4 mr-2" />Choose PDF</>}
                    </Button>
                    {importPdfMsg && <p className="text-sm text-success" role="status">{importPdfMsg}</p>}
                  </CardContent>
                </Card>
              </STEP1OUTER>
            )}

`;

const step1fixed = step1
  .replaceAll('STEP1OUTER', 'div')
  .replaceAll('STEP1INNER', 'div');

s = s.replace(
  '          <Card className="p-6 lg:p-8">\n            <CardHeader className="p-0 pb-4">\n              <CardTitle className="text-xl">PDF layout</CardTitle>',
  step1fixed +
    '            {wizardStep === 2 && (\n          <Card className="p-6 lg:p-8">\n            <CardHeader className="p-0 pb-4">\n              <CardTitle className="text-xl">PDF layout</CardTitle>'
);

function closeAndWrap(titlePart, step, insertBefore) {
  const cardOpen = `          <Card className="p-6 lg:p-8">\n            <CardHeader`;
  const idx = s.indexOf(insertBefore);
  if (idx === -1) {
    console.error('insertBefore not found', insertBefore.slice(0, 30));
    process.exit(1);
  }
  s = s.slice(0, idx) + `            )}\n\n            {wizardStep === ${step} && (\n` + s.slice(idx);
}

// Close PDF layout card - find after layout card's closing Card before Year
s = s.replace(
  /(<CardTitle className="text-xl">PDF layout<\/CardTitle>[\s\S]*?<\/CardContent>\n          <\/Card>)\n\n          <Card className="p-6 lg:p-8">\n            <CardHeader className="p-0 pb-4">\n              <CardTitle className="text-xl">Year/,
  '$1\n            )}\n\n            {wizardStep === 2 && (\n          <Card className="p-6 lg:p-8">\n            <CardHeader className="p-0 pb-4">\n              <CardTitle className="text-xl">Year'
);

// Year card close before Holidays
s = s.replace(
  /(<CardTitle className="text-xl">Year &amp; first month<\/CardTitle>[\s\S]*?<\/CardContent>\n          <\/Card>)\n\n          <Card className="p-6 lg:p-8">\n            <CardHeader className="p-0 pb-4">\n              <CardTitle className="text-xl">Holidays/,
  '$1\n            )}\n\n            {wizardStep === 4 && (\n          <Card className="p-6 lg:p-8">\n            <CardHeader className="p-0 pb-4">\n              <CardTitle className="text-xl">Holidays'
);

// Holidays close before Font
s = s.replace(
  /(<CardTitle className="text-xl">Holidays[\s\S]*?<\/CardContent>\n          <\/Card>)\n\n          <Card className="p-6 lg:p-8">\n            <CardHeader className="p-0 pb-6">\n              <CardTitle className="text-xl">Font settings/,
  '$1\n            )}\n\n            {wizardStep === 2 && (\n          <Card className="p-6 lg:p-8">\n            <CardHeader className="p-0 pb-6">\n              <CardTitle className="text-xl">Font settings'
);

// Font close before Months
s = s.replace(
  /(<CardTitle className="text-xl">Font settings[\s\S]*?<\/CardContent>\n          <\/Card>)\n\n          \{\/\* Months Section \*\/\}/,
  '$1\n            )}\n\n            {wizardStep === 3 && (\n          {/* Months Section */}'
);

// Months - wrap opening
s = s.replace(
  '          {/* Months Section */}\n          <Card className="p-6 lg:p-8">',
  '          {/* Months Section */}\n          <Card className="p-6 lg:p-8">'
);

// Months close before Events - remove free pdf footer inside months
s = s.replace(
  /\s*<div className="flex justify-center sm:justify-end pt-4 border-t border-border\/80 mt-2">[\s\S]*?Free PDF[\s\S]*?<\/div>\s*/,
  '\n'
);

s = s.replace(
  /(<CardTitle className="text-xl">Monthly Photos<\/CardTitle>[\s\S]*?<\/CardContent>\n          <\/Card>)\n\n          \{\/\* Events Section \*\/\}/,
  '$1\n            )}\n\n            {wizardStep === 4 && (\n          {/* Events Section */}'
);

s = s.replace(
  '          {/* Events Section */}\n          <Card className="p-6 lg:p-8">',
  '          {/* Events Section */}\n          <Card className="p-6 lg:p-8">'
);

const step5 = `            {wizardStep === 5 && (
              <S5 className="space-y-8">
                <S5H>
                  <h2 className="text-2xl font-semibold mb-2">Review & checkout</h2>
                  <p className="text-muted-foreground text-sm">Confirm your settings, then pay to download the PDF.</p>
                </S5H>
                <dl className="wizard-review-grid">
                  <S5I className="wizard-review-item"><dt>Layout</dt><dd>{layoutLabel}</dd></S5I>
                  <S5I className="wizard-review-item"><dt>Year</dt><dd>{year} · starts {startMonthName}</dd></S5I>
                  <S5I className="wizard-review-item"><dt>Week</dt><dd>{weekStart === 'monday' ? 'Monday' : 'Sunday'}</dd></S5I>
                  <S5I className="wizard-review-item"><dt>Photos</dt><dd>{photoCount} / {MONTH_SLOT_COUNT}</dd></S5I>
                  <S5I className="wizard-review-item"><dt>Holidays</dt><dd>{holidayCalendars.length ? holidayCalendars.length + ' selected' : 'None'}</dd></S5I>
                  <S5I className="wizard-review-item"><dt>Occasions</dt><dd>{eventCount}</dd></S5I>
                </dl>
${saveBlock.replace('p-4 lg:p-5', 'p-5 border border-border/80')}
                <p className="text-xs text-muted">$2 printable PDF · personal dates only inside the downloaded file</p>
              </S5>
            )}
          </CalendarWizard>
`;

const step5fixed = step5
  .replaceAll('S5H', '<<H>>')
  .replaceAll('S5I', '<<I>>')
  .replaceAll('S5', '<<O>>')
  .replaceAll('<<H>>', 'div')
  .replaceAll('<<I>>', 'div')
  .replaceAll('<<O>>', 'div');

s = s.replace(
  /\n          \{\/\* Submit Button \*\/\}[\s\S]*?<\/form>/,
  `\n${step5fixed}\n        </form>`
);

// Events card close before step 5
s = s.replace(
  /(<CardTitle className="text-xl">Add dates and occasions<\/CardTitle>[\s\S]*?<\/CardContent>\n          <\/Card>)\n\n            \{wizardStep === 5/,
  '$1\n            )}\n\n            {wizardStep === 5'
);

fs.writeFileSync(p, s);
console.log('done');
