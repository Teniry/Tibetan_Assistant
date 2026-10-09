export type DigitalHumanId = 'muxiaowen' | 'muxiaoce' | 'muxiaozhi';

export interface DigitalHumanProfile {
  id: DigitalHumanId;
  name: string;
  role: string;
  description: string;
  waveImage: string;
  speakImage: string;
}

export const DIGITAL_HUMANS: Record<DigitalHumanId, DigitalHumanProfile> = {
  muxiaowen: {
    id: 'muxiaowen',
    name: '木小文',
    role: '木雅语学习智能体',
    description: '查询知识库五语词条；整句未命中时只展示可确认的拆分词。',
    waveImage: '/digital-humans/muxiaowen-wave.gif',
    speakImage: '/digital-humans/muxiaowen-speak.gif',
  },
  muxiaoce: {
    id: 'muxiaoce',
    name: '木小测',
    role: '木雅语测评智能体',
    description: '在线测验、五语知识问答，以及与3D空间同步的视频和文档。',
    waveImage: '/digital-humans/muxiaoce-wave.gif',
    speakImage: '/digital-humans/muxiaoce-speak.gif',
  },
  muxiaozhi: {
    id: 'muxiaozhi',
    name: '木小知',
    role: '木雅知识智能体',
    description: '支持日常交流；文化事实必须引用知识库或可信网页来源。',
    waveImage: '/digital-humans/muxiaozhi-wave.gif',
    speakImage: '/digital-humans/muxiaozhi-speak.gif',
  },
};

export const HOME_DIGITAL_HUMANS = [
  DIGITAL_HUMANS.muxiaoce,
  DIGITAL_HUMANS.muxiaowen,
  DIGITAL_HUMANS.muxiaozhi,
];
