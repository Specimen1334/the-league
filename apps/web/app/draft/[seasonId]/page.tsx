"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function DraftSeasonRedirectPage() {
  const params = useParams<{ seasonId: string }>();
  const router = useRouter();
  const seasonId = params?.seasonId;

  useEffect(() => {
    if (!seasonId) return;
    router.replace(`/draft/${seasonId}/room`);
  }, [router, seasonId]);

  return null;
}
