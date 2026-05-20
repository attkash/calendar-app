import type { ReactNode } from 'react';
import { Card } from './ui/card';
import { WizardStepIndicator } from './wizard/WizardStepIndicator';
import { WizardNav } from './wizard/WizardNav';

type CalendarWizardProps = {
  step: number;
  totalSteps: number;
  onStepClick: (step: number) => void;
  onBack: () => void;
  onNext: () => void;
  isSubmitting: boolean;
  isGeneratingFree: boolean;
  onFreePdf: () => void;
  children: ReactNode;
};

export function CalendarWizard({
  step,
  totalSteps,
  onStepClick,
  onBack,
  onNext,
  isSubmitting,
  isGeneratingFree,
  onFreePdf,
  children,
}: CalendarWizardProps) {
  return (
    <Card className="wizard-shell p-6 sm:p-8 lg:p-10 shadow-card-lg">
      <WizardStepIndicator
        currentStep={step}
        totalSteps={totalSteps}
        onStepClick={onStepClick}
      />
      <div className="wizard-body">
        <div key={step} className="wizard-panel">
          {children}
        </div>
      </div>
      <WizardNav
        currentStep={step}
        totalSteps={totalSteps}
        onBack={onBack}
        onNext={onNext}
        isLastStep={step === totalSteps}
        isSubmitting={isSubmitting}
        isGeneratingFree={isGeneratingFree}
        onFreePdf={onFreePdf}
      />
    </Card>
  );
}
