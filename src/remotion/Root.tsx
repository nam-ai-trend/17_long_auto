import {Composition} from 'remotion';
import {compositionDurationFrames} from './model';
import {YadamComposition, type YadamCompositionProps} from './YadamComposition';

export const RemotionRoot = () => (
  <Composition
    id="YadamPreview"
    component={YadamComposition}
    durationInFrames={300}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={{
      title: '달빛 아래 묻힌 장부',
      cues: [
        {
          id: 'cue-001',
          sceneId: 'scene-001',
          text: '그날 밤, 죽은 사람의 품에서 낯익은 장부가 떨어졌습니다.',
          start: 0,
          end: 5.8,
          sourceAudioDuration: 5.8,
          gapAfter: 1.05,
          gapReason: 'scene',
          manualGap: null,
          ttsStatus: 'estimated',
          audioPath: null,
          leadingSilence: 0,
          trailingSilence: 0,
          ttsError: null,
        },
      ],
      segments: [
        {
          id: 'intro-001',
          sceneId: 'scene-001',
          sceneDataId: null,
          start: 0,
          end: 10,
          type: 'video',
          prompt: '눈보라 속에서 장부를 발견하는 약초꾼',
          semanticBreak: null,
          referenceKeys: [],
          parallaxRecommended: false,
          parallaxEnabled: false,
          motionStages: [],
        },
      ],
      mediaAssets: {},
    }}
    calculateMetadata={({props}: {props: YadamCompositionProps}) => ({
      durationInFrames: compositionDurationFrames(props.cues, props.segments, 30),
    })}
  />
);
