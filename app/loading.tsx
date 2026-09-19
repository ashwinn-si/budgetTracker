import React from "react";
import { Loader } from "@/components/ui/Loader";

export default function GlobalLoading() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-transparent">
      <Loader fullScreen={false} />
    </div>
  );
}
