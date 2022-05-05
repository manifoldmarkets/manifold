export interface Charity {
  id: string
  slug: string
  name: string
  website: string
  ein?: string
  photo?: string
  preview: string
  description: string
  tags?: CharityTag[]
}

type CharityTag = 'Featured' // | 'Health' | 'Poverty' | 'X-Risk' | 'Animal Welfare' | 'Policy'

// Warning: 'name' is currently used as the slug and the txn toId for the charity.
export const charities: Charity[] = [
  {
    name: '1Day Sooner',
    website: 'https://www.1daysooner.org/',
    preview:
      'Accelerating the development of each vaccine by even a couple of days via COVID-19 human challenge trials could save thousands of lives.',
    photo: 'https://i.imgur.com/bUDdzUE.png',
    description: `1Day Sooner is a non-profit that advocates on behalf of COVID-19 challenge trial volunteers.
      
    After a vaccine candidate is created in a lab, it is developed through a combination of pre-clinical evaluation and three phases of clinical trials that test its safety and efficacy. In traditional Phase III trials, participants receive the vaccine candidate or a placebo/active comparator, and efficacy is judged by comparing the prevalence of infection in the vaccine group and the placebo/comparator group, to test the hypothesis that significantly fewer participants in the vaccine group get infected. In these traditional trials, after receiving the treatment, participants return to their homes and their normal daily lives so as to test the treatment under real world conditions. Since only a small proportion of these participants may encounter the disease, it may take a large number of participants and a good deal of time for these trials to reveal differences between the vaccine and placebo groups.
      
    In a human challenge trial (HCT), willing participants would receive the vaccine candidate or placebo and, after some time for the vaccine to take effect, be deliberately exposed to live coronavirus. Since exposure to the virus is guaranteed in HCTs, it may be possible to judge a vaccine candidate’s efficacy more quickly and with far fewer participants than a standard Phase III trial. While HCT efficacy results do not traditionally provide sufficient basis for licensure on their own, they could allow us to (1) more quickly weed out disappointing vaccine candidates or (2) promote the development of promising candidates in conjunction with traditional Phase III studies.
      
    In addition, by gathering detailed data on the process of infection and vaccine protection in a clinical setting, researchers could learn information that proves extremely useful for broader vaccine and therapeutic development efforts. Altogether, there are scenarios in which the speed of HCTs and the richness of the data they provide accelerate the development of an effective and broadly accessible COVID-19 vaccine, with thousands of lives spared (depending on the pandemic’s long-term trajectory).`,
    tags: ['Featured'] as CharityTag[],
  },
  {
    name: 'QURI',
    website: 'https://quantifieduncertainty.org/',
    preview:
      'The Quantified Uncertainty Research Institute advances forecasting and epistemics to improve the long-term future of humanity.',
    photo: 'https://i.imgur.com/ZsSXPjH.png',
    description: `QURI researches systematic practices to specify and estimate the most important parameters for the most important or scalable decisions. Research areas include forecasting, epistemics, evaluations, ontology, and estimation.
    
    We emphasize technological solutions that can heavily scale in the next 5 to 30 years.
    
    We believe that humanity’s success in the next few hundred years will lie intensely on its ability to coordinate and make good decisions. If important governmental and philanthropic bodies become significantly more effective, this will make society far more resilient to many kinds of challenges ahead.`,
    tags: ['Featured'] as CharityTag[],
  },
  {
    name: 'EA Long-Term Future Fund',
    website: 'https://funds.effectivealtruism.org/funds/far-future',
    photo: 'https://i.imgur.com/C2qka9g.png',
    preview:
      'Positively influence the long-term trajectory of civilization by making grants that address global catastrophic risks.',
    description: `The Fund has a broad remit to make grants that promote, implement and advocate for longtermist ideas. Many of our grants aim to address potential risks from advanced artificial intelligence and to build infrastructure and advocate for longtermist projects. However, we welcome applications related to long-term institutional reform or other global catastrophic risks (e.g., pandemics or nuclear conflict).
    
    We intend to support:
    - Projects that directly contribute to reducing existential risks through technical research, policy analysis, advocacy, and/or demonstration projects
    - Training for researchers or practitioners who work to mitigate existential risks, or help with relevant recruitment efforts, or infrastructure for people working on longtermist projects
    - Promoting long-term thinking`,
    tags: ['Featured'] as CharityTag[],
  },
  {
    name: 'GiveWell Maximum Impact Fund',
    website: 'https://www.givewell.org/maximum-impact-fund',
    photo: 'https://i.imgur.com/xikuDMZ.png',
    preview:
      'We search for the charities that save or improve lives the most per dollar.',
    description: `
    GiveWell is a nonprofit dedicated to finding outstanding giving opportunities and publishing the full details of our analysis to help donors decide where to give.
    
    We don't focus solely on financials, such as assessing administrative or fundraising costs. Instead, we conduct in-depth research to determine how much good a given program accomplishes (in terms of lives saved, lives improved, etc.) per dollar spent. Rather than rating as many charities as possible, we focus on the few charities that stand out most (by our criteria) in order to find and confidently recommend high-impact giving opportunities (our list of top charities).
    
    Our top recommendation to GiveWell donors seeking to do the most good possible is to donate to the Maximum Impact Fund. Donations to the Maximum Impact Fund are granted each quarter. We use our latest research to grant the funds to the recommended charity (or charities) where we believe they’ll do the most good.
    
    We grant funds from the Maximum Impact Fund to the recipient charity (or charities) at the end of each fiscal quarter. Our research team decides which charities have the highest priority funding needs at that time. This decision takes into consideration factors such as:

    - Which funding gaps we expect to be filled and unfilled
    - Each charity’s plans for additional funding
    - The cost-effectiveness of each funding gap`,
  },
  {
    name: 'ARC',
    website: 'https://alignment.org/',
    photo: 'https://i.imgur.com/Hwg8OMP.png',
    preview: 'Align future machine learning systems with human interests.',
    description: `ARC is a non-profit research organization whose mission is to align future machine learning systems with human interests. Its current work focuses on developing an alignment strategy that could be adopted in industry today while scaling gracefully to future ML systems. Right now Paul Christiano and Mark Xu are researchers and Kyle Scott handles operations.

What is “alignment”? ML systems can exhibit goal-directed behavior, but it is difficult to understand or control what they are “trying” to do. Powerful models could cause harm if they were trying to manipulate and deceive humans. The goal of intent alignment is to instead train these models to be helpful and honest.

Motivation: We believe that modern ML techniques would lead to severe misalignment if scaled up to large enough computers and datasets. Practitioners may be able to adapt before these failures have catastrophic consequences, but we could reduce the risk by adopting scalable methods further in advance.

What we’re working on: The best way to understand our research priorities and methodology is probably to read our report on Eliciting Latent Knowledge. At a high level, we’re trying to figure out how to train ML systems to answer questions by straightforwardly “translating” their beliefs into natural language rather than by reasoning about what a human wants to hear.

Methodology: We’re unsatisfied with an algorithm if we can see any plausible story about how it eventually breaks down, which means that we can rule out most algorithms on paper without ever implementing them. The cost of this approach is that it may completely miss strategies that exploit important structure in realistic ML models; the benefit is that you can consider lots of ideas quickly. (More)

Future plans: We expect to focus on similar theoretical problems in alignment until we either become more pessimistic about tractability or ARC grows enough to branch out into other areas. Over the long term we are likely to work on a combination of theoretical and empirical alignment research, collaborations with industry labs, alignment forecasting, and ML deployment policy.`,
  },
  {
    name: 'Give Directly',
    website: 'https://www.givedirectly.org/',
    ein: '27-1661997',
    photo: 'https://i.imgur.com/lrdxSyd.jpg',
    preview: 'Send money directly to people living in poverty.',
    description:
      'GiveDirectly is a nonprofit that lets donors like you send money directly to the world’s poorest households. We believe people living in poverty deserve the dignity to choose for themselves how best to improve their lives — cash enables that choice. Since 2009, we’ve delivered $500M+ in cash directly into the hands of over 1 million families living in poverty. We currently have operations in Kenya, Rwanda, Liberia, Malawi, Morocco, Mozambique, DRC, Uganda, and the United States.',
  },
  {
    name: 'Hellen Keller International',
    website: 'https://www.hki.org/',
    ein: '13-5562162',
    photo: 'https://i.imgur.com/Dl97Abk.jpg',
    preview:
      'We envision a world where no one is deprived of the opportunity to live a healthy life – and reach their true potential.',
    description:
      'Right now, 36 million people worldwide — most of them in developing countries — are blind.\n 90 percent of them didn’t have to lose their sight. Helen Keller International is dedicated to combating the causes and consequences of vision loss and making clear vision a reality for those most vulnerable to disease and who lack access to quality eye care.\n Last year alone, we helped provide many tens of millions of people with treatment to prevent diseases of poverty including blinding trachoma and river blindness.\n  Surgeons trained by our staff also performed tens of thousands of cataract surgeries in the developing world.  And in the United States, we screened the vision of nearly 66,000 students living in some of our country’s poorest neighborhoods and provided free eyeglasses to just over 16,000 of them. ',
  },
  {
    name: 'Against Malaria Foundation',
    website: 'https://www.againstmalaria.com/',
    ein: '20-3069841',
    photo: 'https://i.imgur.com/F3JoZi9.png',
    preview: 'We help protect people from malaria.',
    description:
      'AMF (againstmalaria.com) provides funding for long-lasting insecticide-treated net (LLIN) distributions (for protection against malaria) in developing countries. There is strong evidence that distributing LLINs reduces child mortality and malaria cases. AMF conducts post-distribution surveys of completed distributions to determine whether LLINs have reached their intended destinations and how long they remain in good condition.',
  },
  {
    name: 'Rethink Charity',
    website: 'https://rethink.charity/',
    photo: 'https://i.imgur.com/Go7N7As.png',
    preview:
      'Providing vital support to high-impact charities and charitable projects.',
    description: `At Rethink Charity, we’re excited about improving the world by providing vital support to high-impact charities and charitable projects. We equip them with tools to boost their impact, through our projects that empower their donors with tax-efficient giving options and strategically coordinated matching opportunities.
    What we do:

    - Rethink Charity Forward is a cause-neutral donation routing fund for high-impact charities around the world. Canadians have used RC Forward to donate $10 million to high-impact charities since the project was launched in late 2017. 

    - EA Giving Tuesday supports both donors and highly effective nonprofits participating in Facebook’s annual Giving Tuesday match. In addition to setting up systems and processes, the team provides analysis-based recommendations, detailed instructions, and responsive support. The team’s goal is to make it as easy as possible for donors to direct matching dollars to highly effective nonprofits.`,
  },
  {
    name: 'Malaria Consortium',
    website: 'https://www.malariaconsortium.org/',
    ein: '98-0627052',
    photo: 'https://i.imgur.com/LGwy9d8.png ',
    preview:
      'We specialise in the prevention, control and treatment of malaria and other communicable diseases.',
    description:
      'We are dedicated to ensuring our work is supported by strong evidence and remains grounded in the lessons we learn through implementation. We explore beyond current practice, to try out innovative ways – through research, implementation and policy development – to achieve effective and sustainable disease management and control.',
  },
  {
    name: 'The Center for the Study of Partisanship and Ideology',
    website: 'https://cspicenter.org/',
    photo: 'https://i.imgur.com/O88tkOW.png',
    preview:
      'Support and fund research on how ideology and government policy contribute to scientific, technological, and social progress.',
    description: `Over the last few decades, scientific and technological progress have stagnated. Scientists conduct more research than ever before, but groundbreaking innovation is scarce. At the same time, identity politics and political polarization have reached new extremes, and social trends such as family stability and crime are worse than in previous decades and in some cases moving in the wrong direction. What explains these trends, and how can we reverse them?

    Much of the blame lies with the institutions we rely on for administration, innovation, and leadership. Instead of forward-looking governments, we have short-sighted politicians and bloated bureaucracies. Instead of real experts with proven track records, we have so-called ‘experts’ who appeal to the authority of their credentials. Instead of political leaders willing to face facts and make tough tradeoffs, we have politicians who appeal to ignorance and defer responsibility.
    
    To fix our institutions, we need to rethink them from the ground up. That is why CSPI supports and funds research into the administrative systems, organizational structures, and political ideologies of modern governance. Only by understanding what makes these systems so often dysfunctional can we change them for the better.
    
    CSPI believes that governments should be accountable to the populace as a whole, not special interest groups. We think experts should have greater say in public policy, but that there should be different standards for what qualifies as “expertise.” We want to end scientific and technological stagnation and usher in a new era of growth and innovation.
    
    We are interested in funding and supporting research that can speak to these issues in the social sciences through grants and fellowships. CSPI particularly seek outs work that is unlikely to receive support elsewhere. See our home page for more about the kinds of research we are particularly interested in funding.`,
  },
  {
    name: 'Faunalytics',
    website: 'https://faunalytics.org/',
    ein: '01-0686889',
    photo: 'https://i.imgur.com/3JXhuXl.jpg',
    preview:
      'Faunalytics conducts research and shares knowledge to help advocates help animals effectively.',
    description:
      "Faunalytics' mission is to empower animal advocates with access to research, analysis, strategies, and messages that maximize their effectiveness to reduce animal suffering.\n Animals need you, and you need data. We conduct essential research, maintain an online research library, and directly support advocates and organizations in their work to save lives. The range of data we offer helps our movement understand how people think about and respond to advocacy, providing advocates with the best strategies to inspire change for animals. ",
  },
  {
    name: 'The Humane League',
    website: 'https://thehumaneleague.org/',
    ein: '04-3817491',
    photo: 'https://i.imgur.com/za9Rwon.jpg',
    preview:
      'We exist to end the abuse of animals raised for food by influencing the policies of the world’s biggest companies, demanding legislation, and empowering others to take action and leave animals off their plates',
    description:
      'The Humane League (THL) currently operates in the U.S., Mexico, the U.K., and Japan, where they work to improve animal welfare standards through grassroots campaigns, movement building, veg*n advocacy, research, and advocacy training, as well as through corporate, media, and community outreach. They work to build the animal advocacy movement internationally through the Open Wing Alliance (OWA), a coalition founded by THL whose mission is to end the use of battery cages globally.',
  },
  {
    name: 'Wild Animal Initiative',
    website: 'https://www.wildanimalinitiative.org/',
    ein: '82-2281466',
    photo: 'https://i.imgur.com/bOVUnDm.png',
    preview: 'We want to make life better for wild animals.',
    description:
      'Wild Animal Initiative (WAI) currently operates in the U.S., where they work to strengthen the animal advocacy movement through creating an academic field dedicated to wild animal welfare. They compile literature reviews, write theoretical and opinion articles, and publish research results on their website and/or in peer-reviewed journals. WAI focuses on identifying and sharing possible research avenues and connecting with more established fields. They also work with researchers from various academic and non-academic institutions to identify potential collaborators, and they recently launched a grant assistance program.',
  },
  {
    name: 'New Incentives',
    website: 'https://www.newincentives.org/',
    ein: '45-2368993',
    photo: 'https://i.imgur.com/bYl4tk3.png',
    preview: 'Cash incentives to boost vaccination rates and save lives.',
    description:
      'New Incentives (newincentives.org) runs a conditional cash transfer (CCT) program in North West Nigeria which seeks to increase uptake of routine immunizations through cash transfers, raising public awareness of the benefits of vaccination and reducing the frequency of vaccine stockouts.',
  },
  {
    name: 'SCI foundation',
    website: 'https://schistosomiasiscontrolinitiative.org/',
    ein: '',
    photo: 'https://i.imgur.com/sWD8zM5.png',
    preview:
      'SCI works with governments in sub-Saharan Africa to create or scale up programs that treat schistosomiasis and soil-transmitted helminthiasis ("deworming").',
    description:
      'We’re a non-profit initiative supporting governments in sub-Saharan African countries. We support them to develop sustainable, cost-effective programmes against parasitic worm infections such as schistosomiasis and intestinal worms.  Since our foundation in 2002, we’ve contributed to the delivery of over 200 million treatments against these diseases. The programmes are highly effective; parasitic worm infections can be reduced by up to 60% after just one round of treatment.',
  },
  {
    name: 'Wikimedia Foundation',
    website: 'https://wikimediafoundation.org/',
    ein: '20-0049703',
    photo: 'https://i.imgur.com/klEzUbR.png',
    preview: 'We help everyone share in the sum of all knowledge.',
    description:
      'We are the people who keep knowledge free. There is an amazing community of people around the world that makes great projects like Wikipedia. We help them do that work. We take care of the technical infrastructure, the legal challenges, and the growing pains.',
  },
  {
    name: 'Rainforest Trust',
    website: 'https://www.rainforesttrust.org/',
    ein: '13-3500609',
    photo: 'https://i.imgur.com/6MzS530.png',
    preview:
      'Rainforest Trust saves endangered wildlife and protects our planet by creating rainforest reserves through partnerships, community engagement and donor support.',
    description:
      'Our unique, cost-effective conservation model for protecting endangered species has been implemented successfully for over 30 years. Thanks to the generosity of our donors, the expertise of our partners and the participation of local communities across the tropics, our reserves are exemplary models of international conservation.',
  },
  {
    name: 'The Nature Conservancy',
    website: 'https://www.nature.org/en-us/',
    ein: '53-0242652',
    photo: 'https://i.imgur.com/vjxkoGo.jpg',
    preview: 'A Future Where People and Nature Thrive',
    description:
      'The Nature Conservancy is a global environmental nonprofit working to create a world where people and nature can thrive. Founded in the U.S. through grassroots action in 1951, The Nature Conservancy has grown to become one of the most effective and wide-reaching environmental organizations in the world. Thanks to more than a million members and the dedicated efforts of our diverse staff and over 400 scientists, we impact conservation in 76 countries and territories: 37 by direct conservation impact and 39 through partners.',
  },
  {
    name: 'Doctors Without Borders',
    website: 'https://www.doctorswithoutborders.org/',
    ein: '13-3433452',
    photo: 'https://i.imgur.com/xqhH9FE.png',
    preview:
      'We provide independent, impartial medical humanitarian assistance to the people who need it most.',
    description:
      'Doctors Without Borders/Médecins Sans Frontières (MSF) cares for people affected by conflict, disease outbreaks, natural and human-made disasters, and exclusion from health care in more than 70 countries.',
  },
  {
    name: 'World Wildlife Fund',
    website: 'https://www.worldwildlife.org/',
    ein: '52-1693387',
    photo: 'https://i.imgur.com/hDADuqW.png',
    preview:
      'WWF works to sustain the natural world for the benefit of people and wildlife, collaborating with partners from local to global levels in nearly 100 countries.',
    description:
      'As the world’s leading conservation organization, WWF works in nearly 100 countries to tackle the most pressing issues at the intersection of nature, people, and climate. We collaborate with local communities to conserve the natural resources we all depend on and build a future in which people and nature thrive. Together with partners at all levels, we transform markets and policies toward sustainability, tackle the threats driving the climate crisis, and protect and restore wildlife and their habitats.',
  },
  {
    name: 'UNICEF USA',
    website: 'https://www.unicefusa.org/',
    photo: 'https://i.imgur.com/9cxuvZi.png',
    ein: '13-1760110',
    preview:
      "UNICEF USA helps save and protect the world's most vulnerable children.",
    description:
      'Over eight decades, the United Nations Children’s Fund (UNICEF) has built an unprecedented global support system for the world’s children. UNICEF relentlessly works day in and day out to deliver the essentials that give every child an equitable chance in life: health care and immunizations, safe water and sanitation, nutrition, education, emergency relief and more. UNICEF USA advances the global mission of UNICEF by rallying the American public to support the world’s most vulnerable children. Together, we have helped save more children’s lives than any other humanitarian organization.',
  },
  {
    name: 'Vitamin Angels',
    website: 'https://www.vitaminangels.org/',
    ein: '77-0485881',
    photo: 'https://i.imgur.com/Mf35IOu.jpg',
    preview:
      'By improving access to vital nutrition, everyone gets an equal chance to grow, thrive, and prosper.',
    description:
      'Our team of program experts collaborates with thousands of local organizations and national governments around the world, focusing efforts on reaching communities who are underserved. Vitamin Angels’ program partners are a local presence in these communities. As trusted organizations already hard at work, they connect millions of pregnant women and young children with our evidence-based nutrition interventions in addition to the health services they already provide.',
  },
  {
    name: 'Free Software Foundation',
    website: 'https://www.fsf.org/',
    ein: '04-2888848',
    photo: 'https://i.imgur.com/z87sFDE.png',
    preview:
      'The Free Software Foundation (FSF) is a nonprofit with a worldwide mission to promote computer user freedom.',
    description:
      'As our society grows more dependent on computers, the software we run is of critical importance to securing the future of a free society. Free software is about having control over the technology we use in our homes, schools and businesses, where computers work for our individual and communal benefit, not for proprietary software companies or governments who might seek to restrict and monitor us. The Free Software Foundation exclusively uses free software to perform its work.The Free Software Foundation is working to secure freedom for computerusers by promoting the development and use of free (as in freedom) software and documentation—particularly the GNU operating system—and by campaigning against threats to computer user freedom like Digital Restrictions Management (DRM) and software patents.',
  },
  {
    name: 'Direct Relief',
    website: 'https://www.directrelief.org/',
    ein: '95-1831116',
    photo: 'https://i.imgur.com/QS7kHAU.png',
    preview:
      'Direct Relief is a humanitarian aid organization, active in all 50 states and more than 80 countries, with a mission to improve the health and lives of people affected by poverty or emergencies – without regard to politics, religion, or ability to pay.',
    description:
      'Nongovernmental, nonsectarian, and not-for-profit, Direct Relief relies entirely on private contributions to advance its mission and perform a wide range of functions.\n Included among them are identifying key local providers of health services; working to identify the unmet needs of people in the low-resource areas; mobilizing essential medicines, supplies, and equipment that are requested and appropriate for the circumstances; and managing the many details inherent in storing, transporting, and distributing such resources to organizations in the most efficient manner possible.',
  },
  {
    name: 'World Resources Institute',
    website: 'https://www.wri.org/',
    ein: '52-1257057',
    photo: 'https://i.imgur.com/Bi6MgYI.png',
    preview:
      'WRI is a global nonprofit organization that works with leaders in government, business and civil society to research, design, and carry out practical solutions that simultaneously improve people’s lives and ensure nature can thrive.',
    description:
      "Since its founding in 1982, WRI has been guided by its mission and core values which are integrated into all that we do. Our mission: To move human society to live in ways that protect Earth’s environment and its capacity to provide for the needs and aspirations of current and future generations. WRI relies on the generosity of our donors to drive outcomes that help the world to be a fairer, healthier and more sustainable place for people and the planet. We publish our financials annually to highlight our continued fiscal accountability. That's why WRI consistently receives top ratings from charity evaluators for our strong financial stewardship and commitment to transparency and accountability.",
  },
  {
    name: 'ProPublica',
    website: 'https://www.propublica.org/',
    ein: '14-2007220',
    photo: 'https://i.imgur.com/R5Vt3Pb.png',
    preview:
      'The mission: to expose abuses of power and betrayals of the public trust by government, business, and other institutions, using the moral force of investigative journalism to spur reform through the sustained spotlighting of wrongdoing.',
    description:
      'ProPublica is an independent, nonprofit newsroom that produces investigative journalism with moral force. We dig deep into important issues, shining a light on abuses of power and betrayals of public trust — and we stick with those issues as long as it takes to hold power to account. With a team of more than 100 dedicated journalists, ProPublica covers a range of topics including government and politics, business, criminal justice, the environment, education, health care, immigration, and technology. We focus on stories with the potential to spur real-world impact. Among other positive changes, our reporting has contributed to the passage of new laws; reversals of harmful policies and practices; and accountability for leaders at local, state and national levels.',
  },
  {
    name: 'Dana-Farber Cancer Institute',
    website: 'https://www.dana-farber.org/',
    ein: '04-2263040',
    photo: 'https://i.imgur.com/SQNn97p.png',
    preview:
      "For over 70 years, we've led the world by making life-changing breakthroughs in cancer research and patient care, providing the most advanced treatments available.",
    description:
      "Since its founding in 1947, Dana-Farber Cancer Institute in Boston, Massachusetts has been committed to providing adults and children with cancer with the best treatment available today while developing tomorrow's cures through cutting-edge research. Today, the Institute employs more than 5,000 staff, faculty, and clinicians supporting more than 640,000 annual outpatient visits, more than 1,000 hospital discharges per year, and has over 1,100 open clinical trials. Dana-Farber is internationally renowned for its equal commitment to cutting edge research and provision of excellent patient care. The deep expertise in these two areas uniquely positions Dana-Farber to develop, test, and gain FDA approval for new cancer therapies in its laboratories and clinical settings. Dana-Farber researchers have contributed to the development of 35 of 75 cancer drugs recently approved by the FDA for use in cancer patients.",
  },
  {
    name: 'Save The Children',
    website: 'https://www.savethechildren.org/',
    ein: '06-0726487',
    photo: 'https://i.imgur.com/GngYPBI.png',
    preview:
      'Through the decades, Save the Children has continued to work to save children’s lives, and that’s still what we do today.',
    description:
      "Our pioneering programs address children's unique needs, giving them a healthy start in life, the opportunity to learn and protection from harm. In the United States and around the world, our work creates lasting change for children, their families and communities – ultimately, transforming the future we all share.\nThis work is only made possible by the ongoing generosity of our donors, whose valuable support is used in the most cost-effective ways. It's important to note that all our work intersects – helping a boy or girl go to school also protects them from dangers such as child trafficking and early marriage. Keeping children healthy from disease or malnutrition means their parents are more likely to avoid costly treatment and be better able to provide for their family.\nWe don’t go into communities, carry out a project and then move on. We consult with children, their families, community leaders and local councils to understand all the issues or barriers, and then we develop programs that address these. We build trust so that our programs are successful and bring about real change.",
  },
  {
    name: 'World Central Kitchen Incorporated',
    website: 'https://wck.org/',
    ein: '27-3521132',
    photo: 'https://i.imgur.com/te93MaY.png',
    preview:
      'WCK is first to the frontlines, providing meals in response to humanitarian, climate, and community crises. We build resilient food systems with locally led solutions.',
    description:
      "WCK responds to natural disasters, man-made crises, and humanitarian emergencies around the world. We're a team of food first responders, mobilizing with the urgency of now to get meals to the people who need them most. Deploying our model of quick action, leveraging local resources, and adapting in real time, we know that a nourishing meal in a time of crisis is so much more than a plate of food—it's hope, it's dignity, and it's a sign that someone cares.",
  },
  {
    name: 'The Johns Hopkins Center for Health Security',
    website: 'https://www.centerforhealthsecurity.org/',
    ein: '',
    photo: 'https://i.imgur.com/gKZE2Xs.png',
    preview:
      'Our mission: to protect people’s health from epidemics and disasters and ensure that communities are resilient to major challenges.',
    description:
      'The Center for Health Security undertakes a series of projects, collaborations, and initiatives to push forward progress on global health security, emerging infectious diseases and epidemics, medical and public health preparedness and response, deliberate biological threats, and opportunities and risks in the life sciences. We:\n- Conduct research and analysis on major domestic and international health security issues.\n- Engage with researchers, the policymaking community, and the private sector to make progress in the field.\n- Convene expert working groups, congressional seminars, scientific meetings, conferences, and tabletop exercises to stimulate new thinking and provoke action.\n- Educate a rising generation of scholars, practitioners, and policymakers.',
  },
  {
    name: 'ALLFED',
    website: 'https://allfed.info/',
    photo: 'https://i.imgur.com/p235vwF.jpg',
    ein: '27-6601178',
    preview: 'Feeding everyone no matter what.',
    description:
      'The mission of the Alliance to Feed the Earth in Disasters is to help create resilience to global food shocks. We seek to identify various resilient food solutions and to help governments implement these solutions, to increase the chances that people have enough to eat in the event of a global catastrophe. We focus on events that could deplete food supplies or access to 5% of the global population or more.Our ultimate goal is to feed everyone, no matter what. An important aspect of this goal is that we need to establish equitable solutions so that all people can access the nutrition they need, regardless of wealth or location.ALLFED is inspired by effective altruism, using reason and evidence to identify how to do the most good. Our solutions are backed by science and research, and we also identify the most cost-effective solutions, to be able to provide more nutrition in catastrophes.',
  },
].map((charity) => {
  const slug = charity.name.toLowerCase().replace(/\s/g, '-')
  return {
    ...charity,
    id: slug,
    slug,
  }
})
