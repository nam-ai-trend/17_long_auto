import {Check} from '@phosphor-icons/react';
import type {ProjectStage} from '../../shared/contracts';

const steps: {id: ProjectStage; label: string; caption: string}[] = [
  {id: 'story', label: '이야기 시작', caption: '소재와 방향'},
  {id: 'script', label: '대본 설계', caption: '호흡과 연속성'},
  {id: 'production', label: '제작·렌더', caption: '화면과 음향'},
];

const stageIndex = (stage: ProjectStage) => steps.findIndex((step) => step.id === stage);

export type StepRailProps = {
  stage: ProjectStage;
  currentStage?: ProjectStage;
  canNavigateToScript?: boolean;
  canNavigateToProduction?: boolean;
  onNavigate?: (stage: ProjectStage) => void;
};

export const StepRail = ({
  stage,
  currentStage,
  canNavigateToScript = true,
  canNavigateToProduction = true,
  onNavigate,
}: StepRailProps) => {
  const activeViewStage = currentStage ?? stage;
  const maxIdx = stageIndex(stage);

  return (
    <nav className="step-rail" aria-label="제작 단계">
      {steps.map((step, index) => {
        const isPast = index < maxIdx;
        const isActive = step.id === activeViewStage;

        // 이동 가능 여부 판단
        let isClickable = false;
        if (onNavigate) {
          if (step.id === 'story') {
            isClickable = true;
          } else if (step.id === 'script') {
            isClickable = canNavigateToScript || isPast || stage === 'script' || stage === 'production';
          } else if (step.id === 'production') {
            isClickable = canNavigateToProduction || stage === 'production';
          }
        }

        return (
          <button
            type="button"
            key={step.id}
            className={`step-item ${isActive ? 'is-active' : ''} ${isPast ? 'is-complete' : ''} ${isClickable ? 'is-clickable' : ''}`}
            onClick={() => {
              if (isClickable && onNavigate) {
                onNavigate(step.id);
              }
            }}
            disabled={!isClickable}
            title={isClickable ? `${step.label} 단계로 이동` : '이전 단계를 먼저 완료하세요'}
          >
            <span className="step-index" aria-hidden="true">
              {isPast && !isActive ? <Check size={14} weight="bold" /> : index + 1}
            </span>
            <span>
              <strong>{step.label}</strong>
              <small>{step.caption}</small>
            </span>
          </button>
        );
      })}
    </nav>
  );
};
