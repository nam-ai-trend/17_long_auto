import {ArrowLineDown, ArrowUpRight, BookOpenText, Plus, Trash, UploadSimple} from '@phosphor-icons/react';
import type {Project} from '../../shared/contracts';

type Props = {
  projects: Project[];
  onNew: () => void;
  onOpen: (project: Project) => void;
  onImport: (file: File) => void;
  onExport: (project: Project) => void;
  onDelete: (id: string, name: string) => void;
};

const stageLabel = (stage: Project['stage']) =>
  stage === 'story' ? '이야기 설계' : stage === 'script' ? '대본 설계' : '제작·렌더';

export const ProjectHome = ({projects, onNew, onOpen, onImport, onExport, onDelete}: Props) => (
  <main className="home-shell enter-up">
    <section className="hero-copy">
      <span className="eyebrow">LOCAL STORY STUDIO</span>
      <h1>
        <span className="hero-line">이야기는 오래 남고,</span>
        <span className="hero-line">제작은 가벼워집니다.</span>
      </h1>
      <p>
        조선시대 야담 한 편을 대본부터 호흡, 화면, 음향과 렌더링까지 한 흐름으로 완성하세요.
      </p>
      <button className="primary-button group" type="button" onClick={onNew}>
        <span>새 이야기 시작</span>
        <span className="button-orb"><Plus size={18} weight="bold" /></span>
      </button>
      <label className="import-button">
        <input type="file" accept="application/json,.json" onChange={(event) => {const file = event.target.files?.[0]; if (file) onImport(file);}} />
        <UploadSimple size={16} weight="light" />프로젝트 가져오기
      </label>
    </section>

    <section className="home-panel bezel-shell" aria-label="최근 프로젝트">
      <div className="bezel-core">
        <header className="section-heading compact">
          <div>
            <span className="eyebrow">RECENT WORK</span>
            <h2>이어 만들기</h2>
          </div>
          <span className="count-pill">{projects.length}</span>
        </header>
        {projects.length === 0 ? (
          <div className="empty-state">
            <BookOpenText size={30} weight="light" />
            <strong>아직 이야기가 없습니다.</strong>
            <span>첫 프로젝트는 설정까지 1분이면 충분합니다.</span>
          </div>
        ) : (
          <div className="project-list">
            {projects.map((project) => (
              <article className="project-row" key={project.id}>
                <button className="project-open" type="button" onClick={() => onOpen(project)}>
                  <span><strong>{project.name}</strong><small>{project.settings.runtimeMinutes}분 · {stageLabel(project.stage)}</small></span>
                  <span className="row-arrow"><ArrowUpRight size={17} weight="light" /></span>
                </button>
                <div className="project-row-actions">
                  <button className="export-button" type="button" aria-label={`${project.name} 내보내기`} title="프로젝트 내보내기" onClick={() => onExport(project)}><ArrowLineDown size={16} weight="light" /></button>
                  <button className="delete-button" type="button" aria-label={`${project.name} 삭제`} title="프로젝트 삭제" onClick={() => onDelete(project.id, project.name)}><Trash size={16} weight="light" /></button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  </main>
);
