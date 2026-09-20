import React from "react";
import { Loader } from "@/components/ui/Loader";

export default function GlobalLoading() {
  return <Loader fullScreen message="Loading page..." showBrand />;
}
