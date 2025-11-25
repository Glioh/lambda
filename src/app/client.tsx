"use client";

import { useTRPC } from "@/trpc/client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export const Client = () => {
    const trpc = useTRPC();
    // have to be the same as the component and the prefetch MICHAEL PREFETCH
    const { data } = useSuspenseQuery(trpc.createAI.queryOptions({text: "MICHAEL PREFETCH"}));

    useEffect(() => {})
    const [] = useState();

    return (
        <div>
            {JSON.stringify(data)}
        </div>
    )
};