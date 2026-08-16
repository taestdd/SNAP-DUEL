"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 어드민에서 반복되는 버튼 세 종류.
 *
 * shadcn 기본 variant 로는 표현이 안 되는 조합이라 여기서 한 번만 정의한다 —
 * "점선 테두리 추가 버튼"과 "파괴적 아웃라인"은 shadcn 규약에 없다.
 * 사용처마다 className 을 늘어놓으면 결국 예전처럼 값이 흩어진다.
 */

/** 목록에 항목을 더하는 버튼 — 폭 전체, 점선 테두리 */
export function AddButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        "w-full border-dashed border-primary-border bg-primary-bg text-primary",
        "hover:bg-primary-hover/15 hover:text-primary",
        className,
      )}
      {...props}
    />
  );
}

/** 항목을 지우는 버튼 — 파괴적이지만 솔리드가 아닌 아웃라인 */
export function RemoveButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      className={cn(
        "border-destructive-border text-destructive-fg",
        "hover:bg-destructive-bg hover:text-destructive-fg",
        className,
      )}
      {...props}
    />
  );
}

/** 폼 제출 버튼 */
export function SubmitButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  return <Button type="submit" size="sm" className={cn("min-w-20", className)} {...props} />;
}
