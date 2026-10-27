import { IconCheck } from "@tabler/icons-react";

export interface OnboardingStepperProps {
  steps: string[];
  currentStep: number;
  onStepClick?: (stepIndex: number) => void;
  className?: string;
}

export default function OnboardingStepper({
  steps,
  currentStep,
  onStepClick,
  className = "",
}: OnboardingStepperProps) {
  return (
    <nav aria-label="Application progress" className={`onboarding-stepper-nav ${className}`}>
      <ol className="onboarding-stepper">
        {steps.map((label, idx) => {
          const isCompleted = idx < currentStep;
          const isCurrent = idx === currentStep;
          const isUpcoming = idx > currentStep;
          const canClick = isCompleted && !!onStepClick;

          return (
            <li
              key={label}
              className={`stepper-item ${isCompleted ? "completed" : ""} ${isCurrent ? "current" : ""} ${isUpcoming ? "upcoming" : ""}`}
              aria-current={isCurrent ? "step" : undefined}
            >
              {/* Connector line leading into this node (from prev node) */}
              {idx > 0 && (
                <div
                  className={`stepper-track ${idx <= currentStep ? "active" : ""}`}
                  aria-hidden="true"
                />
              )}

              <div
                className={`stepper-node-wrapper ${canClick ? "clickable" : ""}`}
                onClick={canClick ? () => onStepClick(idx) : undefined}
                role={canClick ? "button" : undefined}
                tabIndex={canClick ? 0 : undefined}
                aria-label={`Step ${idx + 1}: ${label} ${isCompleted ? "(Completed - Click to edit)" : isCurrent ? "(Current step)" : ""}`}
                onKeyDown={
                  canClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onStepClick(idx);
                        }
                      }
                    : undefined
                }
              >
                <div className={`stepper-node ${isCompleted ? "node-completed" : isCurrent ? "node-current" : "node-upcoming"}`}>
                  {isCompleted ? (
                    <IconCheck size={16} stroke={3} aria-hidden="true" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>
                <span className="stepper-label">{label}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
