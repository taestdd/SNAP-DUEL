"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * `<option>` 자식을 그대로 받는 shadcn Select 어댑터.
 *
 * 이 코드베이스는 빈 문자열을 "미지정"으로 쓴다 — 사용처가 전부
 * `value={x ?? ""}` / `onChange={(v) => (v || undefined)}` 꼴이다.
 * 그런데 Radix Select는 빈 문자열 value를 금지한다(런타임에 throw).
 *
 * 그래서 경계에서만 센티널로 바꿔치기한다. 바깥에서 보는 값은 계속 ""라
 * 사용처의 `?? ""` / `|| undefined` 로직을 건드리지 않아도 된다.
 * 이 변환을 사용처마다 흩어 놓으면 17곳에서 각각 틀릴 기회가 생긴다.
 */
/** @internal 테스트에서만 쓴다 */
export const EMPTY_VALUE = "__empty__";
const EMPTY = EMPTY_VALUE;

type OptionProps = {
  value?: string | number | readonly string[];
  children?: React.ReactNode;
  disabled?: boolean;
};

/**
 * `<option>` 트리를 SelectItem으로 옮긴다.
 * `{arr.map(...)}`로 만들어진 중첩 배열은 React.Children.toArray가 평탄화해 준다.
 */
export function toItems(children: React.ReactNode): React.ReactNode[] {
  return React.Children.toArray(children).flatMap((child): React.ReactNode[] => {
    if (!React.isValidElement(child)) return [];

    // Children.toArray 는 Fragment 안으로 내려가지 않는다. 그냥 두면
    // <>...</> 로 감싼 option 들이 변환되지 않은 채 SelectContent 에 꽂힌다.
    if (child.type === React.Fragment) {
      return toItems((child.props as { children?: React.ReactNode }).children);
    }

    if (child.type !== "option") return [child];

    const { value, children: label, disabled } = child.props as OptionProps;
    const raw = value === undefined ? "" : String(value);
    const itemValue = raw === "" ? EMPTY : raw;

    return [
      <SelectItem key={itemValue} value={itemValue} disabled={disabled}>
        {label}
      </SelectItem>,
    ];
  });
}

export function OptionSelect({
  value,
  onChange,
  children,
  className,
  placeholder,
  disabled,
  required,
  size,
  "aria-label": ariaLabel,
  id,
}: {
  value: string;
  onChange: (val: string) => void;
  children: React.ReactNode;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  size?: React.ComponentProps<typeof SelectTrigger>["size"];
  "aria-label"?: string;
  id?: string;
}) {
  return (
    <Select
      value={value === "" ? EMPTY : value}
      onValueChange={(next) => onChange(next === EMPTY ? "" : next)}
      disabled={disabled}
      required={required}
    >
      <SelectTrigger
        id={id}
        size={size}
        aria-label={ariaLabel}
        className={cn("w-full", className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{toItems(children)}</SelectContent>
    </Select>
  );
}
