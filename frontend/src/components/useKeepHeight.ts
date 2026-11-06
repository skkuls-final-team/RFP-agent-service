import { useLayoutEffect, useRef, useState } from 'react'

// 쪽을 넘겨도 표 높이 유지 (update-rule-page-height).
// 꽉 찬 쪽(쪽 크기만큼 줄, 펼친 줄 없음)을 그린 높이를 재 두고, 줄이 적은 쪽에서도 그 높이를 최소 높이로 둔다.
// 그래서 마지막 쪽 줄이 적어도 아래 쪽 번호가 위로 올라오지 않는다. 탭·검색·쪽 크기(reset)가 바뀌면 다시 잰다.
// 붙이는 요소는 box-sizing: border-box여야 한다. 아니면 잰 높이(테두리 포함)가 최소 높이보다 커져 끝없이 다시 잰다.
export function useKeepHeight<T extends HTMLElement>(full: boolean, reset: string, page: number) {
  const ref = useRef<T>(null)
  const [kept, setKept] = useState<{ reset: string; h: number } | null>(null)
  useLayoutEffect(() => {
    if (!full || !ref.current) return
    const h = ref.current.offsetHeight
    // 높이는 커질 때만 바꾼다. 같을 때·줄 때 다시 적으면 최소 높이 ↔ 잰 높이가 서로 바꿔 끝없이 다시 그린다
    if (kept?.reset !== reset || h > kept.h + 1) setKept({ reset, h })
  }, [full, reset, page, kept])
  return { ref, minHeight: kept?.reset === reset ? kept.h : undefined }
}
