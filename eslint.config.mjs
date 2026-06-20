import next from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  { ignores: ["node_modules/**", ".next/**", "out/**", "build/**"] },
  ...next,
  ...nextTs,
  {
    // Next 16 / React 19에서 새로 번들된 React Compiler 계열 규칙들.
    // 기존 애니메이션 훅(useArenaAnimation 등)이 reducer 상태를 로컬 UI 상태로
    // 동기화하는 패턴과 충돌하므로 마이그레이션 부채로 분리한다 (block이 아닌 warn).
    // TODO: 훅 리팩터링 후 error로 승격할 것.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
    },
  },
];

export default eslintConfig;
