import { BenchmarkData, AITimelineData, AiBenchmarkPageProps, AILabData } from './types'
import { getContract, getContractFromSlug } from 'common/supabase/contracts'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import { getDashboardProps } from 'web/lib/politics/news-dashboard'

export async function getAiBenchmarkPageProps(): Promise<AiBenchmarkPageProps> {
  const adminDb = await initSupabaseAdmin()
  const getContractFromSlugFunction = (slug: string) =>
    getContractFromSlug(adminDb, slug)

  // Fetch key benchmark contracts
  // Using placeholder slugs - we'll update these with real ones later
  let frontierMathContract, humanityLastExamContract, sweBenchContract, agiTimelineContract, gpuCapacityContract, chatbotArenaContract;
  
  try {
    [
      frontierMathContract,
      humanityLastExamContract,
      sweBenchContract,
      agiTimelineContract,
      gpuCapacityContract,
      chatbotArenaContract,
    ] = await Promise.all([
      getContractFromSlugFunction('frontier-math-benchmark-performance'),
      getContractFromSlugFunction('humanitys-last-exam-performance'),
      getContractFromSlugFunction('swe-bench-coding-performance'),
      getContractFromSlugFunction('when-will-we-achieve-agi'),
      getContractFromSlugFunction('ai-gpu-capacity-growth-prediction'),
      getContractFromSlugFunction('which-company-will-have-the-top-model-on-chatbot-arena'),
    ]);
  } catch (error) {
    console.log('Error fetching contracts, using null values:', error);
    frontierMathContract = null;
    humanityLastExamContract = null;
    sweBenchContract = null;
    agiTimelineContract = null;
    gpuCapacityContract = null;
    chatbotArenaContract = null;
  }

  // Get trending AI headlines dashboard
  let trendingDashboard;
  try {
    trendingDashboard = await getDashboardProps('aibenchmarks');
  } catch (error) {
    console.log('Error fetching dashboard, using dummy data:', error);
    trendingDashboard = {
      state: 'success',
      initialDashboard: {
        id: 'dummy-dashboard-id',
        title: 'AI Benchmarks',
        slug: 'aibenchmarks',
        createdTime: Date.now(),
        creatorId: 'dummy-creator-id',
        items: []
      },
      previews: [],
      initialContracts: [],
      slug: 'aibenchmarks'
    };
  }

  // Generate top AI labs data with probability of having the best model by end of year
  const topLabs: AILabData[] = [
    {
      name: 'Anthropic',
      model: 'Claude',
      score: 9.42,
      winRate: 0.78,
      previousRank: 2,
      probability: 0.42,
      contract: chatbotArenaContract,
    },
    {
      name: 'OpenAI',
      model: 'GPT',
      score: 9.38,
      winRate: 0.76,
      previousRank: 1,
      probability: 0.35,
      contract: null,
    },
    {
      name: 'Google',
      model: 'Gemini',
      score: 9.21,
      winRate: 0.72,
      previousRank: 3,
      probability: 0.15,
      contract: null,
    },
    {
      name: 'xAI',
      model: 'Grok',
      score: 8.95,
      winRate: 0.68,
      previousRank: 5,
      probability: 0.05,
      contract: null,
    },
    {
      name: 'Meta',
      model: 'Llama',
      score: 8.87,
      winRate: 0.65,
      previousRank: 4,
      probability: 0.03,
      contract: null,
    },
  ];

  // Generate placeholder benchmark data
  const benchmarks = {
    reasoning: [
      {
        name: 'FrontierMath',
        description: 'Performance on advanced mathematical reasoning benchmarks',
        category: 'reasoning',
        contract: frontierMathContract,
        currentValue: '78.4%',
        previousValue: '72.1%',
        changeValue: 6.3,
        link: 'https://frontiermath.org',
      },
      {
        name: 'Humanity\'s Last Exam',
        description: 'Performance on exam combining math, science, and humanities',
        category: 'reasoning',
        contract: humanityLastExamContract,
        currentValue: '91.2%',
        previousValue: '86.8%',
        changeValue: 4.4,
        link: 'https://lastexam.org',
      },
      {
        name: 'MMLU',
        description: 'Massive Multitask Language Understanding benchmark',
        category: 'reasoning',
        contract: null, // placeholder
        currentValue: '95.7%',
        previousValue: '92.5%',
        changeValue: 3.2,
      },
    ],
    coding: [
      {
        name: 'SWE-bench',
        description: 'Software engineering benchmark for real-world coding tasks',
        category: 'coding',
        contract: sweBenchContract,
        currentValue: '67.3%',
        previousValue: '59.8%',
        changeValue: 7.5,
        link: 'https://swebench.org',
      },
      {
        name: 'HumanEval',
        description: 'Evaluation of code generation capabilities',
        category: 'coding',
        contract: null, // placeholder
        currentValue: '88.9%',
        previousValue: '84.2%',
        changeValue: 4.7,
      },
      {
        name: 'APPS',
        description: 'Algorithmic problem-solving benchmark',
        category: 'coding',
        contract: null, // placeholder
        currentValue: '72.0%',
        previousValue: '65.1%',
        changeValue: 6.9,
      },
    ],
    safety: [
      {
        name: 'TruthfulQA',
        description: 'Measures model\'s ability to avoid generating misinformation',
        category: 'safety',
        contract: null, // placeholder
        currentValue: '92.1%',
        previousValue: '87.3%',
        changeValue: 4.8,
      },
      {
        name: 'MAIA',
        description: 'Measurement of AI alignment and safety benchmarks',
        category: 'safety',
        contract: null, // placeholder
        currentValue: '82.3%',
        previousValue: '76.5%',
        changeValue: 5.8,
      },
    ],
    capabilities: [
      {
        name: 'GPU Capacity',
        description: 'Total AI training compute (in exaFLOPS)',
        category: 'capabilities',
        contract: gpuCapacityContract,
        currentValue: '48.2 exaFLOPS',
        previousValue: '32.7 exaFLOPS',
        changeValue: 47.4,
      },
      {
        name: 'Largest Model',
        description: 'Parameter count of largest publicly known model',
        category: 'capabilities',
        contract: null, // placeholder
        currentValue: '3.2T',
        previousValue: '2.7T',
        changeValue: 18.5,
      },
    ],
  }

  // Generate placeholder timeline data
  const aiTimeline: AITimelineData[] = [
    {
      name: 'AGI Developed',
      description: 'First system meeting AGI criteria',
      contract: agiTimelineContract,
      date: '2030',
      probability: 0.65,
    },
    {
      name: 'Human-level Reasoning',
      description: 'AI achieves human-level performance across all reasoning tasks',
      contract: null, // placeholder
      date: '2027',
      probability: 0.48,
    },
    {
      name: 'Superhuman Coding',
      description: 'AI exceeds top human programmers in all engineering tasks',
      contract: null, // placeholder
      date: '2026',
      probability: 0.74,
    },
    {
      name: 'Novel Scientific Discovery',
      description: 'AI makes major scientific breakthrough independently',
      contract: null, // placeholder
      date: '2028',
      probability: 0.42,
    },
  ]

  return {
    frontierMathContract,
    humanityLastExamContract,
    sweBenchContract,
    agiTimelineContract,
    gpuCapacityContract,
    chatbotArenaContract,
    topLabs,
    benchmarks,
    aiTimeline,
    trendingDashboard,
  }
}
