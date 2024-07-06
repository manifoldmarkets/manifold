import { promptGPT4 } from "./openai-utils"

const apiHost = 'https://api.stability.ai'
const STABILITY_API_KEY = process.env.STABILITY_API_KEY

interface StabilityAPIV1 {
  textPrompts: { text: string }[],
  width: number,
  height: number
}

interface StabilityAPIV2 {
  prompt: string,
  negativePrompt: string,
  aspectRatio: string,
  outputFormat: string,
}

const StabilitySDXL = async ({textPrompts, width, height}: StabilityAPIV1): Promise<ArrayBuffer | undefined> => {

  const body = JSON.stringify({
    text_prompts: textPrompts,
    width: width,
    height: height
  });

  try {
    const response = await fetch(`${apiHost}/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${STABILITY_API_KEY}`,
        'Accept': 'image/png'
      },
      body: body
    })

    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}`)
    }
    return await response.arrayBuffer()
  } catch (err) {
    console.error('Error generating SDXL image:', err)
    return undefined
  }
}

const StabilityUltra = async ({prompt, aspectRatio, outputFormat}: StabilityAPIV2): Promise<ArrayBuffer | undefined> => {

  const formData = new FormData();
  formData.append('prompt', prompt);
  formData.append('aspect_ratio', aspectRatio);
  formData.append('output_format', outputFormat);

  try {
      const response = await fetch(`${apiHost}/v2beta/stable-image/generate/ultra`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STABILITY_API_KEY}`,
        'Accept': 'image/*',
      },
      body: formData
    })

    if (!response.ok) {
      console.log('Error generating Ultra image:', response)
      throw new Error(`HTTP Error ${response.body}`)
    }
    return await response.arrayBuffer()
  } catch (err) {
    console.error('Error generating Ultra image:', err)
    return undefined
  }
}

export const generateImage = async (marketDetails: string, useUltra: boolean = false): Promise<ArrayBuffer | undefined> => {

  const ultraPrompt = `Describe a vivid, cohesive wide-format image that encapsulates the essence of this question: ${marketDetails}

  Follow these guidelines to create an effective prompt for Stable Diffusion Ultra:
  1. Describe the color and relative position of objects and characters in the scene (bottom left, right third, etc).
  2. Describe the setting and atmosphere. Use adjectives to convey the mood.
  3. Focus on the question's general theme. Don't add details that distract from the main idea. The model will fill in the gaps.
  4. Describe the image using composition terms (focal point, leading lines, etc).
  5. Use short sentences.

  Caution:
  * Steer clear of common prediction market symbols (hourglass, crystal ball, calendar, stock chart, etc).
  * Limit use of text elements, as the model may not generate them accurately.
  * Describe only what is visible in the image, not what is implied or symbolic, and avoid complex scenes.

  Craft your prompt concisely, at most 75 words.`;

  const sdxlPrompt = `Generate a vivid, detailed description illustrating this prediction market: ${marketDetails}
  Follow these guidelines to create an effective prompt for Stable Diffusion 1.5:
    * In the first sentence, choose a charismatic subject that represents the question. Use multiple descriptive adjectives for the subject.
    * In the second sentence, choose a relevant background and describe it in detail, including lighting and mood.
    * In the third sentence, specify an artistic style (e.g., oil painting, cartoon, photorealistic) appropriate to the tone.

    Caution:
    * Steer clear of cliché prediction market symbols (crystal balls, calendars, hourglasses, etc.).
    * Avoid text and numbers since the model will not generate it well.
    * Describe only what is visible in the image, and happening in the present moment, not what is implied or what it symbolizes.

  SD 1.5 is an older model and gets confused with longer prompts, so you must not get fancy. You must return a prompt of no more than 50 words.`

  const imagePrompt = await promptGPT4(useUltra ? ultraPrompt : sdxlPrompt) as string
  if (!imagePrompt) {
    throw new Error('Did not receive image prompt')
  }

  return useUltra ? StabilityUltra({
    prompt: `A hyperrealistic anime-inspired graphic poster.` + imagePrompt,
    negativePrompt: `The image looks like caricature, stock photos, or video games.`,
    aspectRatio: '16:9',
    outputFormat: 'png'
  })
  : StabilitySDXL({
    textPrompts: [{ text: imagePrompt }],
    width: 1344,
    height: 768,
  })
}