import { Button } from '../ui/button';
import { ButtonBusyLabel } from '../ButtonBusyLabel';

type WizardNavProps = {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  isLastStep: boolean;
  isSubmitting?: boolean;
  isGeneratingFree?: boolean;
  onFreePdf?: () => void;
};

export function WizardNav({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  isLastStep,
  isSubmitting = false,
  isGeneratingFree = false,
  onFreePdf,
}: WizardNavProps) {
  return (
    <div className="wizard-nav">
      <div className="wizard-nav__left">
        {currentStep > 1 ? (
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            disabled={isSubmitting || isGeneratingFree}
            className="min-w-[7rem]"
          >
            Back
          </Button>
        ) : (
          <span className="w-[7rem]" aria-hidden />
        )}
      </div>
      <p className="wizard-nav__hint text-sm text-muted hidden sm:block">
        Step {currentStep} of {totalSteps}
      </p>
      <div className="wizard-nav__right flex flex-wrap items-center justify-end gap-2">
        {isLastStep && onFreePdf ? (
          <Button
            type="button"
            variant="outline"
            onClick={onFreePdf}
            disabled={isGeneratingFree || isSubmitting}
            className="bg-white border-yellow-300 text-yellow-400 hover:bg-yellow-50 hover:border-yellow-400 hover:text-yellow-500"
          >
            {isGeneratingFree ? 'Generating…' : 'Free PDF'}
          </Button>
        ) : null}
        {isLastStep ? (
          <Button
            type="submit"
            className={`min-w-[11rem] ${isSubmitting ? 'min-h-14 h-auto py-2' : ''}`}
            disabled={isSubmitting || isGeneratingFree}
          >
            {isSubmitting ? (
              <ButtonBusyLabel status="Redirecting…" />
            ) : (
              'Pay & download PDF'
            )}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={onNext}
            disabled={isSubmitting || isGeneratingFree}
            className="min-w-[7rem]"
          >
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
