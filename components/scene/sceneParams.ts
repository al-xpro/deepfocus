import { CLEAR, type Weather } from "./weather"

export interface SceneLocation {
  latitude: number
  longitude: number
}

export const sceneParams = {
  /** The visitor's place (their real sun and moon), or null for the reference sky. */
  location: null as SceneLocation | null,
  timeOverrideHour: null as number | null,
  /** The weather the scene fades toward: live, or a chosen condition. */
  weather: { ...CLEAR } as Weather,
}

export function setSceneTimeOverride(hour: number | null) {
  sceneParams.timeOverrideHour = hour
}

export function getSceneDate(baseDate: Date = new Date()) {
  if (sceneParams.timeOverrideHour === null) {
    return baseDate
  }

  const date = new Date(baseDate)
  const wholeHours = Math.floor(sceneParams.timeOverrideHour)
  const minutes = Math.round((sceneParams.timeOverrideHour - wholeHours) * 60)

  date.setHours(wholeHours, minutes, 0, 0)
  return date
}
