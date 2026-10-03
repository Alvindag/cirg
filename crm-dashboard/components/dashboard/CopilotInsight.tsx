"use client";

import { Sparkles } from "lucide-react";

import { demoInsight } from "@/lib/das/demo";
import type { OpportunityResult, Product } from "@/lib/das/types";
import { useDasQuery } from "@/lib/das/useDasQuery";
import { SourceBadge } from "./SourceBadge";
import { Widget } from "./Widget";

export function CopilotInsight() {
  // The API ranks customers per product, so take the first product's best lead.
  const products = useDasQuery<Product[]>("/admin/products");
  const product = products.data?.[0];
  const opps = useDasQuery<OpportunityResult>(
    product ? "/ai/opportunities" : null,
    { productId: product?.id, take: 1 },
  );
  const top = opps.data?.items[0];

  const headline = top
    ? `${Math.round(top.probability * 100)}%`
    : demoInsight.headline;
  const text = top
    ? `${top.name} is the strongest lead for ${opps.data?.product ?? product?.name} (${top.likelihood.toLowerCase()} likelihood), based on visits, call outcomes and past purchases.`
    : demoInsight.text;

  return (
    <Widget
      className="relative overflow-hidden"
      title={
        <>
          <Sparkles className="h-4 w-4 text-indigo-300" aria-hidden />
          AI Copilot Insight
        </>
      }
      action={<SourceBadge live={!!top} />}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-indigo-500/20 blur-2xl"
      />
      <p className="relative text-3xl font-semibold tracking-tight text-zinc-100">
        {headline}
      </p>
      <p className="relative mt-2 text-sm leading-relaxed text-zinc-400">
        {text}
      </p>
    </Widget>
  );
}
