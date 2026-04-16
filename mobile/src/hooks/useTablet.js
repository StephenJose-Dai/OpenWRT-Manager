import { useWindowDimensions } from 'react-native'

// 平板判断：宽度 >= 600dp（Android Material Design 规范）
export function useTablet() {
  const { width, height } = useWindowDimensions()
  const isTablet     = width >= 600
  const isLandscape  = width > height
  // 平板横屏时内容区宽度（扣掉侧边栏 220）
  const contentWidth = isTablet ? width - 220 : width
  return { isTablet, isLandscape, width, height, contentWidth }
}

// 平板时用双列，手机单列
export function useColumns(minColumnWidth = 280) {
  const { contentWidth, isTablet } = useTablet()
  if (!isTablet) return 1
  return Math.max(1, Math.floor(contentWidth / minColumnWidth))
}
