import {Player} from '@remotion/player';
import type {Project} from '../../shared/contracts';
import {compositionDurationFrames} from '../../remotion/model';
import {YadamComposition, type MediaAsset} from '../../remotion/YadamComposition';

export const PreviewPlayer = ({project}: {project: Project}) => {
  const title =
    project.candidates.find((candidate) => candidate.id === project.selectedCandidateId)?.title ??
    project.name;

  // 생성 완료된 비디오 및 이미지 매핑
  const mediaAssets: Record<string, MediaAsset> = {};
  for (const pkg of project.visualPromptPackages ?? []) {
    if (pkg.status === 'ready' && pkg.assetUrl) {
      if (pkg.kind === 'intro-video' && pkg.mediaSegmentId) {
        mediaAssets[pkg.mediaSegmentId] = {
          type: 'video',
          url: pkg.assetUrl,
          label: '도입 생성 영상',
        };
      } else if (pkg.kind === 'scene-still') {
        if (pkg.mediaSegmentId) {
          mediaAssets[pkg.mediaSegmentId] = {
            type: 'still',
            url: pkg.assetUrl,
            label: '조선 수묵채색 삽화',
          };
        }
        if (pkg.sceneDataId) {
          mediaAssets[pkg.sceneDataId] = {
            type: 'still',
            url: pkg.assetUrl,
            label: '조선 수묵채색 삽화',
          };
        }
      }
    }
  }

  // Qwen3 TTS 음성 URL 매핑
  const cuesWithAudio = (project.cues ?? []).map((cue) => ({
    ...cue,
    audioUrl: cue.audioPath ? `/api/projects/${project.id}/cues/${cue.id}/audio` : null,
  }));

  return (
    <div className="preview-frame">
      <Player
        component={YadamComposition}
        inputProps={{
          title,
          cues: cuesWithAudio,
          segments: project.mediaSegments,
          mediaAssets,
        }}
        durationInFrames={compositionDurationFrames(project.cues, project.mediaSegments, 30)}
        compositionWidth={1920}
        compositionHeight={1080}
        fps={30}
        controls
        style={{width: '100%', aspectRatio: '16 / 9'}}
      />
    </div>
  );
};
