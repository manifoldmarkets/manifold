import { GlobalConfig } from 'common/globalConfig'
import { getGlobalConfig } from 'web/lib/firebase/globalConfig'
import { HomeDashboard } from './home'

export async function getStaticProps() {
  const globalConfig = await getGlobalConfig()

  return {
    props: { globalConfig },
    revalidate: 60, // regenerate after a minute
  }
}

export default function Dashboard(props: { globalConfig: GlobalConfig }) {
  return <HomeDashboard globalConfig={props.globalConfig} />
}
