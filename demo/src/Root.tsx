import React from "react";
import { Composition } from "remotion";
import { LexDiffDemo } from "./LexDiffDemo";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="LexDiffDemo"
      component={LexDiffDemo}
      durationInFrames={330}
      fps={30}
      width={1280}
      height={720}
    />
  );
};
