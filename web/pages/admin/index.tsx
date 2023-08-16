import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { LabCard } from '../about'
import { NoSEO } from 'web/components/NoSEO'

export default function AdminPage() {
  return (
    <Page>
      <NoSEO />
      <div className="mx-8">
        <Title>Admin</Title>
        <div className="mb-4 flex gap-2">
          <Badge
            href="https://vercel.com/mantic/prod"
            src="https://therealsujitk-vercel-badge.vercel.app/?app=mantic"
          />
          <Badge
            href="https://github.com/manifoldmarkets/manifold/actions"
            src="https://github.com/manifoldmarkets/manifold/actions/workflows/check.yml/badge.svg?branch=main"
          />
        </div>

        <LabCard title="💹 stats" href="/stats" />
        <LabCard title="🍚 umami" href="/umami" />
        <LabCard
          title="🍥 grafana"
          description="db performance"
          href="https://manifoldmarkets.grafana.net/d/TFZtEJh4k/supabase"
        />
        <LabCard
          title="🪵🔥 logflare"
          description="vercel api logs"
          href="https://logflare.app/sources/20705"
        />
        <LabCard
          title="💤 postgres logs"
          href="https://app.supabase.com/project/pxidrgkatumlvfqaxcll/logs/postgres-logs"
        />
        <LabCard title="🎨 design system" href="/styles" />
        <LabCard title="🌑 test new user" href="/admin/test-user" />
        <p className="mb-2 italic">anyone can see this page btw</p>
      </div>
    </Page>
  )
}

const Badge = (props: { src: string; href: string }) => {
  return (
    <a href={props.href}>
      <img src={props.src} alt="" />
    </a>
  )
}
