const fs = require('fs');
const p = 'client/src/components/ApplicationForm.tsx';
let s = fs.readFileSync(p, 'utf8');

function wrapCard(s, titleNeedle, step) {
  const titleIdx = s.indexOf(titleNeedle);
  if (titleIdx === -1) {
    console.error('title not found:', titleNeedle);
    process.exit(1);
  }
  const cardStart = s.lastIndexOf('<Card', titleIdx);
  let i = cardStart;
  let depth = 0;
  let cardEnd = -1;
  while (i < s.length) {
    const o = s.indexOf('<Card', i);
    const c = s.indexOf('</Card>', i);
    if (c === -1) break;
    if (o !== -1 && o < c) {
      depth++;
      i = o + 5;
    } else {
      depth--;
      i = c + 7;
      if (depth === 0) {
        cardEnd = i;
        break;
      }
    }
  }
  if (cardEnd === -1) {
    console.error('end not found', titleNeedle);
    process.exit(1);
  }
  const block = s.slice(cardStart, cardEnd);
  return (
    s.slice(0, cardStart) +
    `{wizardStep === ${step} && (\n` +
    block +
    '\n)}\n' +
    s.slice(cardEnd)
  );
}

const saveStart = s.indexOf('          {requireAuth ? (\n            <Card className="p-4 lg:p-5">');
const saveEnd = s.indexOf('          ) : null}\n\n          <Card className="p-6 lg:p-8">', saveStart);
if (saveStart === -1 || saveEnd === -1) {
  console.error('save', saveStart, saveEnd);
  process.exit(1);
}
const saveBlock = s.slice(saveStart, saveEnd);
s = s.slice(0, saveStart) + s.slice(saveEnd + '          ) : null}\n\n'.length);

const wizardHead = `          <Card className="wizard-shell p-6 sm:p-8 lg:p-10 shadow-card-lg">
            <WizardStepIndicator currentStep={wizardStep} totalSteps={WIZARD_STEP_COUNT} onStepClick={goToWizardStep} />
            <div className="wizard-body">
              <div key={wizardStep} className="wizard-panel">
                {wizardStep === 1 && (
                  <motion.div className="space-y-6">
                    <div className="text-center space-y-3 py-2 sm:py-4">
                      <h2 className="text-2xl sm:text-3xl font-semibold">Getting started</h2>
                      <p className="text-muted-foreground leading-relaxed max-w-lg mx-auto">
                        <strong className="text-foreground">First time here?</strong> Click <strong className="text-foreground">Next</strong> to continue.
                      </p>
                      <p className="text-muted text-sm leading-relaxed max-w-lg mx-auto">
                        <strong className="text-foreground">Returning user?</strong> Upload your previous calendar PDF to restore personal dates.
                      </p>
                    </motion.div>
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
                  </motion.div>
                )}

`;

const pdfIdx = s.indexOf('          <Card className="p-6 lg:p-8">\n            <CardHeader className="p-0 pb-4">\n              <CardTitle className="text-xl">PDF layout</CardTitle>');
s = s.slice(0, pdfIdx) + wizardHead.split('motion.div').join('div') + s.slice(pdfIdx);

s = wrapCard(s, '<CardTitle className="text-xl">Add dates and occasions</CardTitle>', 4);
s = wrapCard(s, '<CardTitle className="text-xl">Monthly Photos</CardTitle>', 3);
s = wrapCard(s, '<CardTitle className="text-xl">Font settings</CardTitle>', 2);
s = wrapCard(s, '<CardTitle className="text-xl">Holidays', 4);
s = wrapCard(s, '<CardTitle className="text-xl">Year &amp; first month</CardTitle>', 2);
s = wrapCard(s, '<CardTitle className="text-xl">PDF layout</CardTitle>', 2);

const step5 = `                {wizardStep === 5 && (
                  <div className="space-y-8">
                    <div>
                      <h2 className="text-2xl font-semibold mb-2">Review &amp; checkout</h2>
                      <p className="text-muted-foreground text-sm leading-relaxed">Check your choices, then pay to download the PDF.</p>
                    </motion.div>
                    <dl className="wizard-review-grid">
                      <div className="wizard-review-item"><dt>Layout</dt><dd>{layoutLabel}</dd></div>
                      <div className="wizard-review-item"><dt>Year</dt><dd>{year} · starts {startMonthName}</dd></div>
                      <div className="wizard-review-item"><dt>Week</dt><dd>{weekStart === 'monday' ? 'Monday' : 'Sunday'}</dd></div>
                      <div className="wizard-review-item"><dt>Photos</dt><dd>{photoCount} / {MONTH_SLOT_COUNT}</dd></motion.div>
                      <div className="wizard-review-item"><dt>Holidays</dt><dd>{holidayCalendars.length ? holidayCalendars.length + ' selected' : 'None'}</dd></motion.div>
                      <div className="wizard-review-item"><dt>Occasions</dt><dd>{eventCount}</dd></motion.div>
                    </dl>
${saveBlock.replace('<Card className="p-4 lg:p-5">', '<Card className="p-5 border border-border/80">')}
                    <p className="text-xs text-muted">$2 printable PDF · personal dates only inside the file</p>
                  </motion.div>
                )}
              </motion.div>
            </motion.div>
            <WizardNav
              currentStep={wizardStep}
              totalSteps={WIZARD_STEP_COUNT}
              onBack={() => goToWizardStep(wizardStep - 1)}
              onNext={() => goToWizardStep(wizardStep + 1)}
              isLastStep={wizardStep === WIZARD_STEP_COUNT}
              isSubmitting={isSubmitting}
              isGeneratingFree={isGeneratingFree}
              onFreePdf={handleFreeGenerate}
            />
          </Card>
`.split('motion.div').join('motion.div').split('motion.div').join('div');

const submitIdx = s.indexOf('          {/* Submit Button */}');
const formEnd = s.indexOf('        </form>', submitIdx);
s = s.slice(0, submitIdx) + step5 + '\n' + s.slice(formEnd);

s = s.replace(
  /\s*<div className="flex justify-center sm:justify-end pt-4 border-t border-border\/80 mt-2">[\s\S]*?Generating free PDF[\s\S]*?<\/motion.div>\s*/,
  '\n'
);
s = s.split('motion.div').join('div');

fs.writeFileSync(p, s);
console.log('applied');
