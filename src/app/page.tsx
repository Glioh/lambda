"use client";

import { prisma } from "@/lib/db";
import {Button} from "@/components/ui/button";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";

const Page = () => {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.createAI.queryOptions({ text: "Michael"}));

  return (
  <div>  
    {JSON.stringify(data)}
  </div>
  );
}

export default Page;
