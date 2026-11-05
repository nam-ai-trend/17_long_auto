import {BookOpenText} from '@phosphor-icons/react';
import {useCallback, useEffect, useState} from 'react';
import type {Project, ProjectStage} from '../shared/contracts';
import {api as defaultApi, type YadamApi} from './api';
import namdareunAiLogo from './assets/namdareun-ai-logo.svg';
import {ProjectHome} from './components/ProjectHome';
import {RenderStudio} from './components/RenderStudio';
import {ScriptStudio} from './components/ScriptStudio';
import {StepRail} from './components/StepRail';
import {StoryStart} from './components/StoryStart';
import {VisualStudio} from './components/VisualStudio';

export const App = ({api = defaultApi}: {api?: YadamApi}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [active, setActive] = useState<Project | null>(null);
  const [viewStage, setViewStage] = useState<ProjectStage | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api.listProjects().then(setProjects).finally(() => setLoading(false));
  }, [api]);

  useEffect(() => {
    if (creating || active) window.scrollTo({top: 0, behavior: 'smooth'});
  }, [creating, viewStage, active?.stage]);

  const updateProject = useCallback((project: Project, forceStage?: ProjectStage) => {
    setActive(project);
    setCreating(false);
    setProjects((items) => [project, ...items.filter((item) => item.id !== project.id)]);
    if (forceStage) {
      setViewStage(forceStage);
    } else if (viewStage === null) {
      setViewStage(project.stage);
    }
  }, [viewStage]);

  const handleOpenProject = async (project: Project) => {
    setActive(project);
    setCreating(false);
    setViewStage(project.stage);
    try {
      const latest = await api.getProject(project.id);
      setActive(latest);
      setViewStage(latest.stage);
      setProjects((items) => [latest, ...items.filter((item) => item.id !== latest.id)]);
    } catch {}
  };

  const handleNavigate = (stage: ProjectStage) => {
    setViewStage(stage);
  };

  const importProject = async (file: File) => {
    updateProject(await api.importManifest(await file.text()));
  };

  const exportProject = async (project: Project) => {
    const manifest = await api.exportManifest(project.id);
    const url = URL.createObjectURL(new Blob([manifest], {type: 'application/json'}));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${project.name.replace(/\s+/g, '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const deleteProject = async (id: string, name: string) => {
    const confirmed = window.confirm(
      `"${name}" 프로젝트를 정말 삭제하시겠습니까?\n프로젝트 폴더와 대본 산출물도 함께 삭제됩니다.`,
    );
    if (!confirmed) return;
    try {
      await api.deleteProject(id);
      setProjects((items) => items.filter((item) => item.id !== id));
      if (active?.id === id) {
        setActive(null);
        setViewStage(null);
      }
    } catch (caught) {
      alert(caught instanceof Error ? caught.message : '프로젝트를 삭제하지 못했습니다.');
    }
  };

  if (loading) {
    return <main className="loading-screen"><BookOpenText size={30} weight="light" /><span>제작실을 여는 중…</span></main>;
  }

  const showWorkspace = creating || Boolean(active);
  const effectiveStage = active ? (viewStage ?? active.stage) : 'story';

  return (
    <div className="app-shell">
      <header className="floating-nav">
        <button
          className="brand"
          type="button"
          onClick={() => {
            setActive(null);
            setCreating(false);
            setViewStage(null);
            void api.listProjects().then(setProjects);
          }}
        >
          <span className="brand-mark"><img src={namdareunAiLogo} alt="남다른AI 로고" /></span>
          <span><strong>남다른AI</strong><small>롱폼 제작 프로그램</small></span>
        </button>
        {showWorkspace && (
          <StepRail
            stage={active?.stage ?? 'story'}
            currentStage={effectiveStage}
            canNavigateToScript={Boolean(active && active.scenes.length > 0)}
            canNavigateToProduction={Boolean(active && active.mediaSegments.length > 0)}
            onNavigate={handleNavigate}
          />
        )}
        <span className="local-chip"><span />로컬 저장</span>
      </header>

      {!showWorkspace && (
        <ProjectHome
          projects={projects}
          onNew={() => {setCreating(true); setViewStage('story');}}
          onOpen={handleOpenProject}
          onImport={importProject}
          onExport={exportProject}
          onDelete={deleteProject}
        />
      )}
      {showWorkspace && effectiveStage === 'story' && (
        <StoryStart
          api={api}
          initialProject={active}
          onProject={(p) => updateProject(p, 'script')}
          onBack={() => {setActive(null); setCreating(false); setViewStage(null);}}
        />
      )}
      {showWorkspace && effectiveStage === 'script' && active && (
        <ScriptStudio
          project={active}
          api={api}
          onProject={(p) => updateProject(p, p.stage === 'production' && active.stage === 'script' ? 'production' : undefined)}
          onNavigate={handleNavigate}
        />
      )}
      {showWorkspace && effectiveStage === 'production' && active && (
        <main className="workspace production-workspace enter-up">
          <VisualStudio
            project={active}
            api={api}
            onProject={updateProject}
            onNavigate={handleNavigate}
          />
          <RenderStudio project={active} api={api} />
        </main>
      )}
    </div>
  );
};
