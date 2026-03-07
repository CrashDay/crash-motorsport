"use client";

import dynamic from "next/dynamic";

const DanielsParkClient = dynamic(() => import("./DanielsParkClient"), {
  ssr: false,
});

export default function DanielsParkPageClient(props) {
  return <DanielsParkClient {...props} />;
}
