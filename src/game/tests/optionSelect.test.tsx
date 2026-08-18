import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { toItems, EMPTY_VALUE } from "@/components/OptionSelect";

/**
 * OptionSelect가 `<option>`을 SelectItem으로 옮기는 변환만 검증한다.
 * 렌더링이 아니라 요소 트리 변환이라 DOM 없이 확인할 수 있다.
 *
 * 여기서 지키려는 것: Radix가 금지하는 빈 문자열 value가 SelectItem에
 * 절대 도달하지 않는 것. 사용처 40여 곳이 ""를 "미지정"으로 쓰고 있어서
 * 이게 새면 어드민 폼이 런타임에 통째로 죽는다.
 */

function valuesOf(nodes: React.ReactNode[]): unknown[] {
  return nodes.map((n) => (n as ReactElement<{ value?: unknown }>).props.value);
}

describe("OptionSelect - option → SelectItem 변환", () => {
  it("빈 문자열 value를 센티널로 바꾼다", () => {
    const items = toItems(<option value="">전체</option>);
    expect(valuesOf(items)).toEqual([EMPTY_VALUE]);
  });

  it("value가 아예 없는 option도 센티널로 간다", () => {
    const items = toItems(<option>없음</option>);
    expect(valuesOf(items)).toEqual([EMPTY_VALUE]);
  });

  it("일반 value는 그대로 둔다", () => {
    const items = toItems(
      <>
        <option value="attack">attack</option>
        <option value="skill">skill</option>
      </>,
    );
    expect(valuesOf(items)).toEqual(["attack", "skill"]);
  });

  it("map()이 만든 중첩 배열을 평탄화한다", () => {
    const tags = ["a", "b", "c"];
    const items = toItems(
      <>
        <option value="">전체</option>
        {tags.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </>,
    );
    expect(valuesOf(items)).toEqual([EMPTY_VALUE, "a", "b", "c"]);
  });

  it("조건부로 걸러진 option은 사라진다", () => {
    const extra = "";
    const items = toItems(
      <>
        <option value="x">x</option>
        {extra && <option value={extra}>never</option>}
      </>,
    );
    expect(valuesOf(items)).toEqual(["x"]);
  });

  it("어떤 입력에도 빈 문자열 value가 새어 나가지 않는다", () => {
    const items = toItems(
      <>
        <option value="">A</option>
        <option value="ok">B</option>
        <option>C</option>
      </>,
    );
    expect(valuesOf(items)).not.toContain("");
    expect(items).toHaveLength(3);
  });

  it("숫자 value는 문자열로 넘긴다", () => {
    const items = toItems(<option value={3}>3</option>);
    expect(valuesOf(items)).toEqual(["3"]);
  });
});
