import type { Metadata } from "next";

import { ControlCenter } from "@/components/control/control-center";

import "@/styles/control-center.css";

export const metadata: Metadata = { title: "chalk" };

export default function ControlPage() {
  return <ControlCenter />;
}
