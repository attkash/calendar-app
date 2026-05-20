const STEP_SHORT_LABELS = ['Start', 'Layout', 'Photos', 'Dates', 'Review'] as const;

type WizardStepIndicatorProps = {
  currentStep: number;
  totalSteps: number;
  onStepClick: (step: number) => void;
};

export function WizardStepIndicator({
  currentStep,
  totalSteps,
  onStepClick,
}: WizardStepIndicatorProps) {
  return (
    <nav
      className="wizard-steps"
      aria-label="Calendar setup progress"
    >
      <ol className="wizard-steps__list">
        {Array.from({ length: totalSteps }, (_, i) => {
          const step = i + 1;
          const isActive = step === currentStep;
          const isComplete = step < currentStep;
          const label = STEP_SHORT_LABELS[i] ?? `Step ${step}`;

          return (
            <li key={step} className="wizard-steps__item">
              <button
                type="button"
                onClick={() => onStepClick(step)}
                className={`wizard-steps__button ${isActive ? 'wizard-steps__button--active' : ''} ${isComplete ? 'wizard-steps__button--complete' : ''}`}
                aria-current={isActive ? 'step' : undefined}
                aria-label={`Step ${step}: ${label}${isActive ? ' (current)' : ''}`}
                title={label}
              >
                <span className="wizard-steps__circle">{step}</span>
                <span className="wizard-steps__label">{label}</span>
              </button>
              {step < totalSteps && (
                <span
                  className={`wizard-steps__connector ${step < currentStep ? 'wizard-steps__connector--complete' : ''}`}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
