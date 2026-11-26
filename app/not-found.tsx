import type { Metadata } from "next";
import NotFoundView from "@/components/NotFoundView";

export const metadata: Metadata = {
  title: "Lost at sea · DeepFocus",
  description: "This page drifted away.",
};

export default function NotFound() {
  return <NotFoundView />;
}
