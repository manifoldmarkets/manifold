import React, { useState } from 'react'
import { CoachMark } from './coach-mark'
import { findNodeHandle, UIManager } from 'react-native'
import { useRouter } from 'expo-router'
import { useTutorial } from './onboaring-context'

export function OnboardingManager({
  visible,
  onComplete,
}: {
  visible: boolean
  onComplete: () => void
}) {
  const router = useRouter()
  const [targetMeasurements, setTargetMeasurements] = useState<any>(null)
  const { currentStep, setCurrentStep, steps } = useTutorial()

  const measureTarget = (ref: React.RefObject<any>) => {
    if (!ref?.current) return

    const element = findNodeHandle(ref.current)
    if (element) {
      UIManager.measure(element, (x, y, width, height, pageX, pageY) => {
        setTargetMeasurements({ x: pageX, y: pageY, width, height })
      })
    }
  }

  const handleNext = async () => {
    if (currentStep < steps.length - 1) {
      const nextStep = steps[currentStep + 1]

      if (nextStep.route) {
        await router.push(nextStep.route)
        setTimeout(() => {
          measureTarget(nextStep.ref)
          setCurrentStep(currentStep + 1)
        }, 500)
      } else {
        measureTarget(nextStep.ref)
        setCurrentStep(currentStep + 1)
      }
    } else {
      onComplete()
    }
  }

  React.useEffect(() => {
    if (visible && steps.length > 0) {
      measureTarget(steps[0].ref)
    }
  }, [visible])

  if (!visible) return null

  const currentTutorial = steps[currentStep]

  return (
    <CoachMark
      visible={visible}
      target={targetMeasurements}
      title={currentTutorial.title}
      description={currentTutorial.description}
      position={currentTutorial.position}
      onNext={handleNext}
      onSkip={onComplete}
    />
  )
}
