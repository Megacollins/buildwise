"use client";

import dynamic from "next/dynamic";

/** Client-only 3D viewer (WebGL cannot render on the server). */
export const LazyViewer3D = dynamic(() => import("./Viewer3D").then((m) => m.Viewer3D), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[320px] w-full items-center justify-center rounded-xl border border-line bg-[#0e1215] text-[13px] text-muted">
      Preparing 3D model…
    </div>
  ),
});
