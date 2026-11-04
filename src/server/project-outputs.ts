import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import type {Project, StoryCandidate, StoryScene} from '../shared/contracts';

/**
 * 프로젝트의 최신 상태를 프로젝트 루트의 /outputs 폴더 및 projects/<projectId>/outputs/ 폴더에
 * 사람이 읽기 좋은 마크다운, 텍스트, 분석 리포트로 동기화합니다.
 */
export const syncProjectOutputs = (project: Project, assetRoot?: string): void => {
  if (!project.id) return;

  const rootOutputsDir = join(process.cwd(), 'outputs');
  const safeProjectName =
    project.name
      .replace(/[^\w\s가-힣-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 45) || project.id.slice(0, 8);
  const projectSpecificOutputsDir = join(rootOutputsDir, safeProjectName);

  const targetDirs = [rootOutputsDir, projectSpecificOutputsDir];
  if (assetRoot) {
    targetDirs.push(join(assetRoot, project.id, 'outputs'));
  }

  for (const dir of targetDirs) {
    try {
      mkdirSync(dir, {recursive: true});
    } catch {}
  }

  const writeToTargets = (fileName: string, content: string): void => {
    for (const dir of targetDirs) {
      try {
        writeFileSync(join(dir, fileName), content, 'utf8');
      } catch {}
    }
  };

  const nowString = new Date().toLocaleString('ko-KR');

  // 1. 후보 목록 (01_candidates.md)
  if (project.candidates && project.candidates.length > 0) {
    const candidateLines: string[] = [
      `# 📜 이야기 후보 기획안 (Candidates)`,
      ``,
      `- **프로젝트명:** ${project.name}`,
      `- **설정 런타임:** ${project.settings.runtimeMinutes}분 (${project.settings.era})`,
      `- **선택된 후보 ID:** ${project.selectedCandidateId ?? '선택 대기'}`,
      `- **마지막 갱신:** ${nowString}`,
      ``,
      `---`,
      ``,
    ];

    project.candidates.forEach((cand: StoryCandidate, idx: number) => {
      const isSelected = project.selectedCandidateId === cand.id;
      candidateLines.push(
        `## [후보 ${idx + 1}] ${cand.title} ${isSelected ? '⭐️ [선택된 이야기]' : ''}`,
        ``,
        `> **핵심 훅 (로그라인):** "${cand.hook}"`,
        ``,
        `- **주인공:** ${cand.protagonist}`,
        cand.antagonist ? `- **적대자:** ${cand.antagonist}` : '',
        `- **배경 장소:** ${cand.location}`,
        `- **핵심 단서/오브제:** ${cand.centralObject}`,
        ``,
        `### 📖 상세 줄거리 (시놉시스)`,
        `${cand.premise}`,
        ``,
        `### ⚡ 극적 전개 전략`,
        `- **핵심 반전:** ${cand.causalTurn}`,
        `- **결말 보상:** ${cand.endingPromise}`,
        cand.strategy ? `- **전개 전략:** ${cand.strategy}` : '',
        ``,
        `---`,
        ``,
      );
    });

    writeToTargets('01_candidates.md', candidateLines.filter(Boolean).join('\n'));
  }

  // 2. 이야기 구조 및 챕터 (02_story_structure.md)
  if (project.chapters && project.chapters.length > 0) {
    const structureLines: string[] = [
      `# 🗺️ 이야기 구조 및 챕터 플롯 (Story Structure)`,
      ``,
      `- **프로젝트명:** ${project.name}`,
      `- **총 챕터 수:** ${project.chapters.length}개`,
      `- **총 씬 수:** ${project.scenes.length}개 씬`,
      `- **마지막 갱신:** ${nowString}`,
      ``,
      `---`,
      ``,
    ];

    project.chapters.forEach((chap, idx) => {
      structureLines.push(
        `## [제 ${idx + 1}장] ${chap.title}`,
        `> **장의 목적/역할:** ${chap.purpose ?? ''}`,
        ``,
        `- **포함된 씬 ID:** ${chap.sceneIds?.join(', ') ?? ''}`,
        ``,
      );
    });

    writeToTargets('02_story_structure.md', structureLines.join('\n'));
  }

  // 3. 완성 대본 (03_script_full.md) & 순수 텍스트 (04_script_narration_only.txt)
  if (project.scenes && project.scenes.length > 0) {
    const totalChars = project.scenes.reduce(
      (acc: number, scene: StoryScene) => acc + (scene.text?.length || 0),
      0,
    );
    const estMinutes = (totalChars / 330).toFixed(1);

    const scriptLines: string[] = [
      `# 🎬 장편 야담 완성 대본 (Full Script)`,
      ``,
      `- **작품명:** ${project.name}`,
      `- **총 씬 수:** ${project.scenes.length}개 씬`,
      `- **총 글자 수:** ${totalChars.toLocaleString()}자`,
      `- **예상 낭독 시간:** 약 ${estMinutes}분 (분당 330자 기준)`,
      `- **내레이션 큐 수:** ${project.cues?.length || 0}개 문장`,
      `- **마지막 갱신:** ${nowString}`,
      ``,
      `---`,
      ``,
    ];

    const narrationOnlyLines: string[] = [];

    project.scenes.forEach((scene: StoryScene, idx: number) => {
      const sceneNum = String(idx + 1).padStart(2, '0');
      const sceneChars = scene.text?.length || 0;

      scriptLines.push(
        `## [씬 ${sceneNum}] ${scene.title}`,
        ``,
        `- **배경 공간:** ${scene.location ?? '미상'}`,
        `- **씬의 목적:** ${scene.objective ?? ''}`,
        `- **사건의 전개/변화:** ${scene.change ?? ''}`,
        `- **분량:** ${sceneChars}자`,
        ``,
        `### [내레이션 및 대사 전문]`,
        `${scene.text ?? ''}`,
        ``,
        `---`,
        ``,
      );

      narrationOnlyLines.push(
        `[씬 ${sceneNum}: ${scene.title}]`,
        scene.text ?? '',
        ``,
      );
    });

    writeToTargets('03_script_full.md', scriptLines.filter(Boolean).join('\n'));
    writeToTargets('04_script_narration_only.txt', narrationOnlyLines.join('\n'));

    // 6. 종합 스토리 분석 리포트 (06_story_analysis.md)
    const selectedCand = project.candidates.find((c) => c.id === project.selectedCandidateId);
    const avgCharsPerScene = Math.round(totalChars / project.scenes.length);

    const analysisLines: string[] = [
      `# 📊 장편 야담 스토리 구조 & 페이싱 분석 리포트`,
      ``,
      `- **작품명:** ${project.name}`,
      `- **분석 시각:** ${nowString}`,
      `- **목표 런타임 / 실제 추정치:** ${project.settings.runtimeMinutes}분 / 약 ${estMinutes}분 (${totalChars.toLocaleString()}자)`,
      ``,
      `---`,
      ``,
      `## 1. 런타임 & 호흡 볼륨 분석`,
      `- **총 씬 수:** ${project.scenes.length}개 씬`,
      `- **씬당 평균 분량:** 약 ${avgCharsPerScene}자 (1씬당 약 2.5~3분 호흡)`,
      `- **문장 호흡 단위(큐):** 총 ${project.cues?.length || 0}개 문장으로 분절되어 롱폼 몰입감 극대화`,
      `- **조선시대 분위기:** ${project.settings.era} 배경에 걸맞은 고풍스러운 문체와 감각 묘사 수록`,
      ``,
      `## 2. 서사 인물 및 갈등 구도`,
      selectedCand ? `- **주인공:** ${selectedCand.protagonist}` : '',
      selectedCand?.antagonist ? `- **적대자:** ${selectedCand.antagonist}` : '',
      selectedCand ? `- **핵심 단서/오브제:** ${selectedCand.centralObject}` : '',
      selectedCand ? `- **극적 반전:** ${selectedCand.causalTurn}` : '',
      selectedCand ? `- **결말 보상:** ${selectedCand.endingPromise}` : '',
      ``,
      `## 3. 씬별 호흡 및 텐션 맵 (Pacing & Tension Table)`,
      ``,
      `| 씬 번호 | 씬 제목 | 배경 공간 | 목표 & 사건 변화 | 분량(자) | 긴장도 |`,
      `|:---:|:---|:---|:---|:---:|:---:|`,
    ];

    project.scenes.forEach((scene: StoryScene, idx: number) => {
      const sceneNum = String(idx + 1).padStart(2, '0');
      const chars = scene.text?.length || 0;
      // 텐션 레벨 계산 (초반: 긴장 조성, 중반: 위기/대립 심화, 후반: 절정/해소)
      let tension = '보통 🟡';
      if (idx === 0) tension = '호기심 🟢';
      else if (idx >= 2 && idx <= 5) tension = '긴장 고조 🟠';
      else if (idx >= 6 && idx <= 10) tension = '위기 심화 🔴';
      else if (idx === 11 || idx === 12) tension = '최고 절정 🔥';
      else if (idx >= 13) tension = '카타르시스/해소 🟢';

      const briefChange = (scene.change || scene.objective || '').replace(/\|/g, '-').slice(0, 45);
      analysisLines.push(
        `| 씬 ${sceneNum} | ${scene.title} | ${scene.location || '미상'} | ${briefChange} | ${chars}자 | ${tension} |`,
      );
    });

    analysisLines.push(
      ``,
      `## 4. 연출 및 영상화 권장 사항`,
      `- **배경 음악(BGM):** 초반에는 고요하고 신비로운 대금/해금 선율, 중반 위기에서는 박진감 있는 북소리와 현악기, 결말에서는 따뜻한 여운의 피리/가야금 권장`,
      `- **음성(TTS) 톤:** 차분하고 신뢰감 있는 스토리텔러 톤에 적절한 문장 간 쉼(Pause)을 두어 긴장감 유지`,
      `- **시각 연출(Visual):** 씬마다 강조되는 핵심 오브제(서찰, 비밀 장부 등)를 클로즈업하여 시청자 이탈 방지`,
      ``,
    );

    writeToTargets('06_story_analysis.md', analysisLines.filter(Boolean).join('\n'));
  }

  // 4. 큐 데이터 (05_cues.json)
  if (project.cues && project.cues.length > 0) {
    writeToTargets('05_cues.json', JSON.stringify(project.cues, null, 2));
  }

  // 5. 시각 생성 프롬프트 패키지 (07_visual_prompts.md & json)
  if (project.visualPromptPackages && project.visualPromptPackages.length > 0) {
    const promptLines: string[] = [
      `# 🎨 시각 생성 프롬프트 명세서 (Visual Prompt Packages)`,
      ``,
      `- **작품명:** ${project.name}`,
      `- **총 프롬프트 수:** ${project.visualPromptPackages.length}개`,
      `- **비주얼 바이블 기준팩:** ${project.visualBible?.length || 0}개`,
      `- **마지막 갱신:** ${nowString}`,
      ``,
      `> 💡 **생성 파이프라인 가이드:**`,
      `> 1. **[기준팩]**: 인물/장소/오브제 기준 이미지를 먼저 승인하여 일관성을 고정합니다.`,
      `> 2. **[도입 영상]**: 고정된 인물/장소를 참조하여 키프레임을 생성한 뒤 Seedance 2.5로 모션을 생성합니다.`,
      `> 3. **[본편 삽화]**: 씬별 삽화를 생성하고 2.5D 카메라 모션(확대/팬)을 적용합니다.`,
      ``,
      `---`,
      ``,
    ];

    project.visualPromptPackages.forEach((pkg, idx) => {
      promptLines.push(
        `## [${idx + 1}] ${pkg.kind.toUpperCase()} (${pkg.id})`,
        `- **추천 AI 모델:** \`${pkg.model}\``,
        `- **화면 비율 / 구도:** ${pkg.aspectRatio} · ${pkg.cameraDistance}`,
        pkg.durationSeconds ? `- **영상 길이:** ${pkg.durationSeconds}초` : '',
        pkg.referenceKeys.length > 0 ? `- **참조 기준팩:** ${pkg.referenceKeys.join(', ')}` : '',
        `- **조명 및 톤:** ${pkg.lighting}`,
        `- **모션 안전 여백:** ${pkg.motionSafeMarginPercent}%`,
        ``,
        `### ✍️ Positive Prompt (프롬프트)`,
        `\`\`\``,
        `${pkg.prompt}`,
        `\`\`\``,
        ``,
        `### 🚫 Negative Prompt (네거티브)`,
        `\`\`\``,
        `${pkg.negativePrompt}`,
        `\`\`\``,
        ``,
        `---`,
        ``,
      );
    });

    writeToTargets('07_visual_prompts.md', promptLines.filter(Boolean).join('\n'));
    writeToTargets('07_visual_prompts.json', JSON.stringify(project.visualPromptPackages, null, 2));
  }

  // 6. 전체 개요 요약 (summary.md)
  const summaryLines: string[] = [
    `# 📋 프로젝트 종합 개요 (Project Summary)`,
    ``,
    `- **ID:** \`${project.id}\``,
    `- **작품명:** ${project.name}`,
    `- **진행 단계:** ${project.stage}`,
    `- **목표 런타임:** ${project.settings.runtimeMinutes}분`,
    `- **시대/스타일:** ${project.settings.era} / ${project.settings.styleName}`,
    `- **후보 수:** ${project.candidates.length}개`,
    `- **씬 수:** ${project.scenes.length}개`,
    `- **내레이션 큐 수:** ${project.cues.length}개 문장`,
    `- **시각 프롬프트 패키지 수:** ${project.visualPromptPackages.length}개`,
    `- **생성 시각:** ${project.createdAt}`,
    `- **최근 수정:** ${project.updatedAt}`,
    ``,
    `## 📁 산출물 파일 안내`,
    `- \`01_candidates.md\`: 기획 후보 3개 및 시놉시스, 반전·결말 전개 전략`,
    `- \`02_story_structure.md\`: 챕터 구성 및 씬별 플롯`,
    `- \`03_script_full.md\`: 14개 씬 지문/목적/대사/내레이션 완성 대본 전문`,
    `- \`04_script_narration_only.txt\`: 오디오/TTS 및 복사용 순수 텍스트`,
    `- \`05_cues.json\`: 문장별 싱크 큐 타임라인 원본 데이터`,
    `- \`06_story_analysis.md\`: 씬별 호흡, 페이싱, 텐션 맵 및 연출 분석 리포트`,
    `- \`07_visual_prompts.md\`: 86개 전체 비주얼 프롬프트 패키지 명세서 (영문 프롬프트/모델/카메라/네거티브)`,
    `- \`07_visual_prompts.json\`: 자동화용 비주얼 프롬프트 JSON 데이터`,
  ];
  writeToTargets('summary.md', summaryLines.join('\n'));
};
