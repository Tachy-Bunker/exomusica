import type { ReactNode } from "react";
import { useAudioStore } from "../lib/audioStore";
import { stopClip } from "../lib/clipPlayer";
import { renderMarkdown } from "../lib/markdown";
import { StudyFile } from "./StudyFile";

/** A plain player (nothing downloads until play is pressed). It pauses the site's music, like the study reader's. */
function ArticleAudio({ url }: { url: string }) {
  return (
    <div className="audio-reader">
      <audio
        controls
        preload="none"
        src={url}
        onPlay={() => { stopClip(); const m = useAudioStore.getState(); if (m.isPlaying) m.toggle(); }}
      />
    </div>
  );
}

export const articleAudio = (url: string): ReactNode => <ArticleAudio url={url} />;
export const articleFile = (url: string, label: string | undefined): ReactNode => <StudyFile url={url} label={label} info={null} />;

/** How a news post or wiki page is drawn for readers: the renderer studies use, and the one the article editor previews with. */
export function renderArticle(markdown: string, onNavigate: (path: string) => void): ReactNode {
  return renderMarkdown(markdown, onNavigate, { extended: true, audio: articleAudio, images: { editable: false }, file: articleFile });
}
