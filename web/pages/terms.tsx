import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { Page } from 'web/components/layout/page'
import { useTracking } from 'web/hooks/use-tracking'

export default function PrivacyPage() {
  useTracking('view terms of service page')

  return (
    <Page>
      <SEO
        title="Terms of service"
        description="Terms of service of Manifold Markets"
        url="/terms"
      />

      <Col className="items-center">
        <Col className="h-full rounded bg-white p-4 py-8 sm:p-8 sm:shadow-md">
          <>
            <style
              dangerouslySetInnerHTML={{
                __html:
                  "\n  [data-custom-class='body'], [data-custom-class='body'] * {\n          background: transparent !important;\n        }\n[data-custom-class='title'], [data-custom-class='title'] * {\n          font-family: Arial !important;\nfont-size: 26px !important;\ncolor: #000000 !important;\n        }\n[data-custom-class='subtitle'], [data-custom-class='subtitle'] * {\n          font-family: Arial !important;\ncolor: #595959 !important;\nfont-size: 14px !important;\n        }\n[data-custom-class='heading_1'], [data-custom-class='heading_1'] * {\n          font-family: Arial !important;\nfont-size: 19px !important;\ncolor: #000000 !important;\n        }\n[data-custom-class='heading_2'], [data-custom-class='heading_2'] * {\n          font-family: Arial !important;\nfont-size: 17px !important;\ncolor: #000000 !important;\n        }\n[data-custom-class='body_text'], [data-custom-class='body_text'] * {\n          color: #595959 !important;\nfont-size: 14px !important;\nfont-family: Arial !important;\n        }\n[data-custom-class='link'], [data-custom-class='link'] * {\n          color: #3030F1 !important;\nfont-size: 14px !important;\nfont-family: Arial !important;\nword-break: break-word !important;\n        }\n",
              }}
            />
            <div data-custom-class="body">
              <div align="center" style={{ textAlign: 'left' }}>
                <div
                  align="center"
                  className="MsoNormal"
                  data-custom-class="title"
                  style={{ textAlign: 'left', lineHeight: '1.5' }}
                >
                  <strong>
                    <span style={{ lineHeight: '22.5px', fontSize: 26 }}>
                      <span className="block-component" />
                      <span className="question">TERMS OF SERVICE</span>
                      <span className="statement-end-if-in-editor" />
                    </span>
                  </strong>
                </div>
                <div
                  align="center"
                  className="MsoNormal"
                  style={{ textAlign: 'center', lineHeight: '22.5px' }}
                >
                  <a name="_7m5b3xg56u7y" />
                </div>
                <div
                  align="center"
                  className="MsoNormal"
                  data-custom-class="subtitle"
                  style={{ textAlign: 'left', lineHeight: '150%' }}
                >
                  <br />
                </div>
                <div
                  align="center"
                  className="MsoNormal"
                  data-custom-class="subtitle"
                  style={{ textAlign: 'left', lineHeight: '1.5' }}
                >
                  <span
                    style={{
                      color: 'rgb(89, 89, 89)',
                      fontSize: '14.6667px',
                      textAlign: 'justify',
                    }}
                  >
                    <strong>
                      Last updated{' '}
                      <span
                        className="block-container question question-in-editor"
                        data-id="6d5ec16f-716c-32d6-1aa6-f4c1bd8cce1f"
                        data-type="question"
                      >
                        October 27, 2022
                      </span>
                    </strong>
                  </span>
                  <br />
                  <a name="_gm5sejt4p02f" />
                </div>
              </div>
              <div align="center" style={{ textAlign: 'left' }}>
                <br />
              </div>
              <div align="center" style={{ textAlign: 'left' }}>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: '115%' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: '115%' }}
                >
                  <br />
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <span style={{ color: 'rgb(127, 127, 127)' }}>
                      <span style={{ color: 'rgb(0, 0, 0)' }}>
                        <strong>
                          <span data-custom-class="heading_1">
                            TABLE OF CONTENTS
                          </span>
                        </strong>
                      </span>
                    </span>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <br />
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <a data-custom-class="link" href="#agreement">
                      <span style={{ color: 'rgb(89, 89, 89)' }}>
                        1. AGREEMENT TO TERMS
                      </span>
                    </a>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <a data-custom-class="link" href="#ip">
                      <span style={{ color: 'rgb(89, 89, 89)' }}>
                        2. INTELLECTUAL PROPERTY RIGHTS
                      </span>
                    </a>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <span style={{ color: 'rgb(89, 89, 89)' }}>
                      <a data-custom-class="link" href="#userreps">
                        3. USER REPRESENTATIONS
                      </a>
                    </span>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <a data-custom-class="link" href="#userreg">
                      <span style={{ color: 'rgb(89, 89, 89)' }}>
                        <span data-type="conditional-block">
                          <span
                            className="block-component"
                            data-record-question-key="user_account_option"
                            data-type="statement"
                          >
                            <span style={{ fontSize: 15 }} />
                          </span>
                        </span>
                        4. USER REGISTRATION
                      </span>
                    </a>
                  </span>
                  <span
                    className="statement-end-if-in-editor"
                    data-type="close"
                  >
                    <span style={{ fontSize: 15 }} />
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <a data-custom-class="link" href="#products">
                      <span style={{ color: 'rgb(89, 89, 89)' }}>
                        5. PRODUCTS
                      </span>
                    </a>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <a data-custom-class="link" href="#purchases">
                      <span style={{ color: 'rgb(89, 89, 89)' }}>
                        6. PURCHASES AND PAYMENT
                      </span>
                    </a>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span
                    style={{
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: 'rgb(89, 89, 89)',
                    }}
                  >
                    <span
                      data-type="conditional-block"
                      style={{ color: 'rgb(10, 54, 90)', textAlign: 'left' }}
                    >
                      <span
                        className="block-component"
                        data-record-question-key="return_option"
                        data-type="statement"
                        style={{ fontSize: 15 }}
                      />
                    </span>
                  </span>
                  <a data-custom-class="link" href="#returnrefunds">
                    <span style={{ color: 'rgb(89, 89, 89)' }}>
                      7. <span className="block-component" />
                      REFUNDS
                      <span className="else-block" /> POLICY
                    </span>
                  </a>
                  <a data-custom-class="link" href="#returnrefunds" />
                  <a data-custom-class="link" href="#returnrefunds">
                    <span style={{ color: 'rgb(89, 89, 89)' }}>
                      <span className="statement-end-if-in-editor" />
                    </span>
                  </a>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <a data-custom-class="link" href="#prohibited">
                      <span style={{ color: 'rgb(89, 89, 89)' }}>
                        8. PROHIBITED ACTIVITIES
                      </span>
                    </a>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <a data-custom-class="link" href="#ugc">
                      <span style={{ color: 'rgb(89, 89, 89)' }}>
                        9. USER GENERATED CONTRIBUTIONS
                      </span>
                    </a>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <span style={{ color: 'rgb(89, 89, 89)' }}>
                      <a data-custom-class="link" href="#license">
                        10. CONTRIBUTION LICENSE
                      </a>
                    </span>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <a data-custom-class="link" href="#reviews">
                      <span style={{ color: 'rgb(89, 89, 89)' }}>
                        <span
                          className="block-container if"
                          data-type="if"
                          id="a378120a-96b1-6fa3-279f-63d5b96341d3"
                        >
                          <span data-type="conditional-block">
                            <span
                              className="block-component"
                              data-record-question-key="review_option"
                              data-type="statement"
                            >
                              <span style={{ fontSize: 15 }} />
                            </span>
                          </span>
                        </span>
                      </span>
                    </a>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <a data-custom-class="link" href="#mobile">
                      <span style={{ color: 'rgb(89, 89, 89)' }}>
                        <span
                          className="block-container if"
                          data-type="if"
                          id="c954892f-02b9-c743-d1e8-faf0d59a4b70"
                        >
                          <span data-type="conditional-block">
                            <span
                              className="block-component"
                              data-record-question-key="mobile_app_option"
                              data-type="statement"
                            >
                              <span style={{ fontSize: 15 }} />
                            </span>
                          </span>
                        </span>
                        11. MOBILE APPLICATION LICENSE
                      </span>
                      &nbsp;
                    </a>
                    <a data-custom-class="link" href="#agreement">
                      <span style={{ color: 'rgb(89, 89, 89)' }}>
                        <span
                          className="statement-end-if-in-editor"
                          data-type="close"
                        >
                          <span style={{ fontSize: 15 }} />
                        </span>
                      </span>
                    </a>
                  </span>
                </div>
                <div
                  align="center"
                  style={{ textAlign: 'left', lineHeight: '1.5' }}
                >
                  <span style={{ fontSize: 15 }}>
                    <span className="block-component" />
                  </span>
                  <span style={{ fontSize: 15 }}>
                    <span style={{ color: 'rgb(89, 89, 89)' }}>
                      <a data-custom-class="link" href="#socialmedia">
                        12. SOCIAL MEDIA
                      </a>
                      <a data-custom-class="link" href="#agreement">
                        <span style={{ color: 'rgb(89, 89, 89)' }}>
                          <span
                            className="statement-end-if-in-editor"
                            data-type="close"
                          >
                            <span style={{ fontSize: 15 }} />
                          </span>
                        </span>
                      </a>
                    </span>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <span style={{ color: 'rgb(89, 89, 89)' }}>
                      <a data-custom-class="link" href="#submissions">
                        13. SUBMISSIONS
                      </a>
                    </span>
                  </span>
                </div>
                <div
                  align="center"
                  style={{ textAlign: 'left', lineHeight: '1.5' }}
                >
                  <span style={{ fontSize: 15 }}>
                    <span className="block-component" />
                  </span>
                  <span style={{ fontSize: 15 }}>
                    <a data-custom-class="link" href="#thirdparty">
                      <span style={{ color: 'rgb(89, 89, 89)' }}>
                        14. THIRD-PARTY WEBSITE AND CONTENT
                      </span>
                    </a>
                    <a data-custom-class="link" href="#agreement">
                      <span style={{ color: 'rgb(89, 89, 89)' }}>
                        <span
                          className="statement-end-if-in-editor"
                          data-type="close"
                        >
                          <span style={{ fontSize: 15 }} />
                        </span>
                      </span>
                    </a>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <a data-custom-class="link" href="#advertisers">
                      <span style={{ color: 'rgb(89, 89, 89)' }}>
                        <span
                          className="block-container if"
                          data-type="if"
                          id="14038561-dad7-be9d-370f-f8aa487b2570"
                        >
                          <span data-type="conditional-block">
                            <span
                              className="block-component"
                              data-record-question-key="advertiser_option"
                              data-type="statement"
                            >
                              <span style={{ fontSize: 15 }} />
                            </span>
                          </span>
                        </span>
                      </span>
                    </a>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <span style={{ color: 'rgb(89, 89, 89)' }}>
                      <a data-custom-class="link" href="#sitemanage">
                        15. SITE MANAGEMENT
                      </a>
                    </span>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <a data-custom-class="link" href="#privacypolicy">
                      <span style={{ color: 'rgb(89, 89, 89)' }}>
                        <span
                          className="block-container if"
                          data-type="if"
                          id="bdd90fa9-e664-7d0b-c352-2b8e77dd3bb4"
                        >
                          <span data-type="conditional-block">
                            <span
                              className="block-component"
                              data-record-question-key="privacy_policy_option"
                              data-type="statement"
                            >
                              <span style={{ fontSize: 15 }} />
                            </span>
                          </span>
                        </span>
                        16. PRIVACY POLICY
                      </span>
                    </a>
                    <a data-custom-class="link" href="#advertisers" />
                    <a data-custom-class="link" href="#agreement">
                      <span style={{ color: 'rgb(89, 89, 89)' }}>
                        <span
                          className="statement-end-if-in-editor"
                          data-type="close"
                        >
                          <span style={{ fontSize: 15 }}>
                            <span
                              className="block-container if"
                              data-type="if"
                              id="87a7471d-cf82-1032-fdf8-601d37d7b017"
                            >
                              <span data-type="conditional-block">
                                <span
                                  className="block-component"
                                  data-record-question-key="privacy_policy_followup"
                                  data-type="statement"
                                  style={{ fontSize: '14.6667px' }}
                                >
                                  <span style={{ fontSize: 15 }} />
                                </span>
                              </span>
                            </span>
                          </span>
                        </span>
                      </span>
                    </a>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <a data-custom-class="link" href="#dmca">
                      <span style={{ color: 'rgb(89, 89, 89)' }}>
                        <span className="block-component">
                          <span className="block-component" />
                          <span className="block-component">
                            <span className="block-container if" data-type="if">
                              <span
                                className="statement-end-if-in-editor"
                                data-type="close"
                              >
                                <span style={{ fontSize: 15 }} />
                              </span>
                            </span>
                          </span>
                        </span>
                      </span>
                    </a>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span className="block-component" />
                  <span className="block-container if" data-type="if">
                    <span
                      className="statement-end-if-in-editor"
                      data-type="close"
                    >
                      <span style={{ fontSize: 15 }}>
                        <span className="block-component" />
                      </span>
                    </span>
                  </span>
                  <span style={{ fontSize: 15 }}>
                    <a data-custom-class="link" href="#copyright">
                      <span style={{ color: 'rgb(89, 89, 89)' }}>
                        17. COPYRIGHT INFRINGEMENTS
                      </span>
                    </a>
                  </span>
                  <span className="block-container if" data-type="if">
                    <span
                      className="statement-end-if-in-editor"
                      data-type="close"
                    >
                      <span style={{ fontSize: 15 }} />
                    </span>
                  </span>
                  <span className="block-component" />
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <a data-custom-class="link" href="#terms">
                      <span style={{ color: 'rgb(89, 89, 89)' }}>
                        18. TERM AND TERMINATION
                      </span>
                    </a>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <a data-custom-class="link" href="#modifications">
                      <span style={{ color: 'rgb(89, 89, 89)' }}>
                        19. MODIFICATIONS AND INTERRUPTIONS
                      </span>
                    </a>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <a data-custom-class="link" href="#law">
                      <span style={{ color: 'rgb(89, 89, 89)' }}>
                        20. GOVERNING LAW
                      </span>
                    </a>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <a data-custom-class="link" href="#disputes">
                      <span style={{ color: 'rgb(89, 89, 89)' }}>
                        21. DISPUTE RESOLUTION
                      </span>
                    </a>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <span style={{ color: 'rgb(89, 89, 89)' }}>
                      <a data-custom-class="link" href="#corrections">
                        22. CORRECTIONS
                      </a>
                    </span>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <a data-custom-class="link" href="#disclaimer">
                      <span style={{ color: 'rgb(89, 89, 89)' }}>
                        23. DISCLAIMER
                      </span>
                    </a>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <a data-custom-class="link" href="#liability">
                      <span style={{ color: 'rgb(89, 89, 89)' }}>
                        24. LIMITATIONS OF LIABILITY
                      </span>
                    </a>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <span style={{ color: 'rgb(89, 89, 89)' }}>
                      <a data-custom-class="link" href="#indemnification">
                        25. INDEMNIFICATION
                      </a>
                    </span>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <a data-custom-class="link" href="#userdata">
                      <span style={{ color: 'rgb(89, 89, 89)' }}>
                        26. USER DATA
                      </span>
                    </a>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <a data-custom-class="link" href="#electronic">
                      <span style={{ color: 'rgb(89, 89, 89)' }}>
                        27. ELECTRONIC COMMUNICATIONS, TRANSACTIONS, AND
                        SIGNATURES
                      </span>
                    </a>
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    <span className="block-component" />
                  </span>
                  <span style={{ fontSize: 15 }}>
                    <span style={{ color: 'rgb(89, 89, 89)' }}>
                      <a data-custom-class="link" href="#california">
                        28. CALIFORNIA USERS AND RESIDENTS
                      </a>
                      <a data-custom-class="link" href="#agreement">
                        <span style={{ color: 'rgb(89, 89, 89)' }}>
                          <span
                            className="statement-end-if-in-editor"
                            data-type="close"
                          >
                            <span style={{ fontSize: 15 }} />
                          </span>
                        </span>
                      </a>
                    </span>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <a data-custom-class="link" href="#misc">
                      <span style={{ color: 'rgb(89, 89, 89)' }}>
                        29. MISCELLANEOUS
                      </span>
                    </a>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <span style={{ fontSize: 15 }}>
                    <span style={{ color: 'rgb(89, 89, 89)' }}>
                      <a data-custom-class="link" href="#contact">
                        30. CONTACT US
                      </a>
                    </span>
                  </span>
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <br />
                </div>
                <div style={{ lineHeight: '1.5', textAlign: 'left' }}>
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_1"
                  id="agreement"
                  style={{ lineHeight: '1.5' }}
                >
                  <a name="_6aa3gkhykvst" />
                  <strong>
                    <span
                      style={{
                        lineHeight: '115%',
                        fontFamily: 'Arial',
                        fontSize: 19,
                      }}
                    >
                      <strong>
                        <span
                          style={{
                            lineHeight: '115%',
                            fontFamily: 'Arial',
                            fontSize: 19,
                          }}
                        >
                          1.&nbsp;
                        </span>
                      </strong>
                      AGREEMENT TO TERMS
                    </span>
                  </strong>
                </div>
              </div>
              <div align="center" style={{ textAlign: 'left', lineHeight: 1 }}>
                <br />
              </div>
              <div align="center" style={{ textAlign: 'left' }}>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5' }}
                >
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    These Terms of Use constitute a legally binding agreement
                    made between you, whether personally or on behalf of an
                    entity (“you”) and{' '}
                    <span
                      className="block-container question question-in-editor"
                      data-id="9d459c4e-c548-e5cb-7729-a118548965d2"
                      data-type="question"
                    >
                      Manifold Markets, Inc.
                    </span>
                    <span className="block-component" /> ("
                    <span className="block-component" />
                    <strong>Company</strong>
                    <span className="statement-end-if-in-editor" />
                    ", “<strong>we</strong>”, “<strong>us</strong>”, or “
                    <strong>our</strong>”), concerning your access to and use of
                    the{' '}
                    <span
                      className="block-container question question-in-editor"
                      data-id="fdf30452-99b8-c68b-5cdf-34af764cd1fd"
                      data-type="question"
                    >
                      https://manifold.markets
                    </span>{' '}
                    website as well as any other media form, media channel,
                    mobile website or mobile application related, linked, or
                    otherwise connected thereto (collectively, the “Site”).
                    <span
                      style={{
                        fontSize: '11.0pt',
                        lineHeight: '115%',
                        msoFareastFontFamily: 'Calibri',
                        color: '#595959',
                        msoThemecolor: 'text1',
                        msoThemetint: 166,
                      }}
                    >
                      <span
                        style={{
                          fontSize: '11.0pt',
                          lineHeight: '115%',
                          msoFareastFontFamily: 'Calibri',
                          color: '#595959',
                          msoThemecolor: 'text1',
                          msoThemetint: 166,
                        }}
                      >
                        <span
                          style={{
                            fontSize: '11.0pt',
                            lineHeight: '115%',
                            msoFareastFontFamily: 'Calibri',
                            color: '#595959',
                            msoThemecolor: 'text1',
                            msoThemetint: 166,
                          }}
                        >
                          <span className="question">
                            <span className="block-component" />
                          </span>
                          <span
                            style={{
                              fontSize: '11.0pt',
                              lineHeight: '115%',
                              msoFareastFontFamily: 'Calibri',
                              color: '#595959',
                              msoThemecolor: 'text1',
                              msoThemetint: 166,
                            }}
                          >
                            <span className="block-component" />
                          </span>{' '}
                          We are registered in
                          <span className="block-component" />
                          <span className="block-component" />
                          <span className="block-component" />{' '}
                          <span
                            style={{
                              fontSize: '11.0pt',
                              lineHeight: '115%',
                              msoFareastFontFamily: 'Calibri',
                              color: '#595959',
                              msoThemecolor: 'text1',
                              msoThemetint: 166,
                            }}
                          >
                            <span
                              style={{
                                fontSize: '11.0pt',
                                lineHeight: '115%',
                                msoFareastFontFamily: 'Calibri',
                                color: '#595959',
                                msoThemecolor: 'text1',
                                msoThemetint: 166,
                              }}
                            >
                              <span className="question">Delaware</span>,{' '}
                              <span className="question">United States</span>
                            </span>
                          </span>
                          <span className="statement-end-if-in-editor" />
                          <span className="block-component" />
                        </span>
                      </span>
                    </span>
                  </span>
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      msoFareastFontFamily: 'Calibri',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    <span
                      style={{
                        fontSize: '11.0pt',
                        lineHeight: '115%',
                        msoFareastFontFamily: 'Calibri',
                        color: '#595959',
                        msoThemecolor: 'text1',
                        msoThemetint: 166,
                      }}
                    >
                      <span className="statement-end-if-in-editor">.</span>
                      <span className="else-block" />
                    </span>
                  </span>
                  <span className="statement-end-if-in-editor" />
                  <span className="block-component" /> You agree that by
                  accessing the Site, you have read, understood, and agreed to
                  be bound by all of these Terms of Use. IF YOU DO NOT AGREE
                  WITH ALL OF THESE TERMS OF USE, THEN YOU ARE EXPRESSLY
                  PROHIBITED FROM USING THE SITE AND YOU MUST DISCONTINUE USE
                  IMMEDIATELY.
                </div>
              </div>
              <div align="center" style={{ textAlign: 'left', lineHeight: 1 }}>
                <br />
              </div>
              <div align="center" style={{ textAlign: 'left' }}>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5' }}
                >
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    Supplemental terms and conditions or documents that may be
                    posted on the Site from time to time are hereby expressly
                    incorporated herein by reference. We reserve the right, in
                    our sole discretion, to make changes or modifications to
                    these Terms of Use <span className="block-component" />
                    from time to time
                    <span className="else-block" />. We will alert you about any
                    changes by updating the “Last updated” date of these Terms
                    of Use, and you waive any right to receive specific notice
                    of each such change. Please ensure that you check the
                    applicable Terms every time you use our Site so that you
                    understand which Terms apply. You will be subject to, and
                    will be deemed to have been made aware of and to have
                    accepted, the changes in any revised Terms of Use by your
                    continued use of the Site after the date such revised Terms
                    of Use are posted.
                  </span>
                </div>
              </div>
              <div align="center" style={{ textAlign: 'left', lineHeight: 1 }}>
                <br />
              </div>
              <div align="center" style={{ textAlign: 'left' }}>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5' }}
                >
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    The information provided on the Site is not intended for
                    distribution to or use by any person or entity in any
                    jurisdiction or country where such distribution or use would
                    be contrary to law or regulation or which would subject us
                    to any registration requirement within such jurisdiction or
                    country. Accordingly, those persons who choose to access the
                    Site from other locations do so on their own initiative and
                    are solely responsible for compliance with local laws, if
                    and to the extent local laws are applicable.
                  </span>
                </div>
                <div className="MsoNormal" style={{ lineHeight: '115%' }}>
                  <span className="block-component" />
                  <span className="block-component">
                    <span className="block-component" />
                  </span>
                </div>
                <div className="MsoNormal" style={{ lineHeight: 1 }}>
                  <span style={{ fontSize: 15 }}>
                    <br />
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5' }}
                >
                  <span style={{ fontSize: 15, color: 'rgb(89, 89, 89)' }}>
                    The{' '}
                    <span style={{ fontSize: 15, color: 'rgb(89, 89, 89)' }}>
                      Site is not tailored to comply with industry-specific
                      regulations (Health Insurance Portability and
                      Accountability Act (HIPAA), Federal Information Security
                      Management Act (FISMA), etc.), so if your interactions
                      would be subjected to such laws, you may not use this
                      Site. You may not use the Site in a way that would violate
                      the Gramm-Leach-Bliley Act (GLBA).
                    </span>
                  </span>
                  <span style={{ fontSize: 15, color: 'rgb(89, 89, 89)' }}>
                    <span style={{ fontSize: 15, color: 'rgb(89, 89, 89)' }}>
                      <span className="block-component" />
                      <span
                        className="block-container if"
                        data-type="if"
                        id="a2595956-7028-dbe5-123e-d3d3a93ed076"
                      >
                        <span
                          className="statement-end-if-in-editor"
                          data-type="close"
                        />
                      </span>
                    </span>
                  </span>
                </div>
              </div>
              <div
                align="center"
                data-custom-class="body_text"
                style={{ textAlign: 'left', lineHeight: 1 }}
              >
                <br />
              </div>
              <div align="center" style={{ textAlign: 'left' }}>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5' }}
                >
                  <span
                    className="block-container if"
                    data-type="if"
                    id="a2595956-7028-dbe5-123e-d3d3a93ed076"
                  >
                    <span data-type="conditional-block">
                      <span data-type="body">
                        <span
                          style={{
                            fontSize: '11.0pt',
                            lineHeight: '115%',
                            fontFamily: 'Arial',
                            color: '#595959',
                            msoThemecolor: 'text1',
                            msoThemetint: 166,
                          }}
                        >
                          <span className="block-component" />
                          <span
                            className="block-container if"
                            data-type="if"
                            id="a2595956-7028-dbe5-123e-d3d3a93ed076"
                          >
                            <span data-type="conditional-block">
                              <span data-type="body">
                                <span
                                  style={{
                                    color: 'rgb(89, 89, 89)',
                                    fontSize: '14.6667px',
                                  }}
                                >
                                  The Site is intended for users who are at
                                  least 13 years of age. All users who are
                                  minors in the jurisdiction in which they
                                  reside (generally under the age of 18) must
                                  have the permission of, and be directly
                                  supervised by, their parent or guardian to use
                                  the Site. If you are a minor, you must have
                                  your parent or guardian read and agree to
                                  these Terms of Use prior to you using the
                                  Site.
                                </span>
                              </span>
                            </span>
                          </span>
                          <span data-type="body">
                            <span
                              style={{
                                color: 'rgb(89, 89, 89)',
                                fontSize: '14.6667px',
                              }}
                            >
                              <span className="block-component" />
                            </span>
                          </span>
                        </span>
                      </span>
                    </span>
                  </span>
                </div>
              </div>
              <div
                align="center"
                style={{ textAlign: 'left', lineHeight: '1.5' }}
              >
                <br />
              </div>
              <div
                align="center"
                style={{ textAlign: 'left', lineHeight: '1.5' }}
              >
                <br />
              </div>
              <div align="center" style={{ textAlign: 'left' }}>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_1"
                  id="ip"
                  style={{ lineHeight: '1.5' }}
                >
                  <a name="_b6y29mp52qvx" />
                  <strong>
                    <span
                      style={{
                        lineHeight: '115%',
                        fontFamily: 'Arial',
                        fontSize: 19,
                      }}
                    >
                      <strong>
                        <span
                          style={{
                            lineHeight: '115%',
                            fontFamily: 'Arial',
                            fontSize: 19,
                          }}
                        >
                          <strong>
                            <span
                              style={{
                                lineHeight: '115%',
                                fontFamily: 'Arial',
                                fontSize: 19,
                              }}
                            >
                              <strong>
                                <span
                                  style={{
                                    lineHeight: '115%',
                                    fontFamily: 'Arial',
                                    fontSize: 19,
                                  }}
                                >
                                  2.
                                </span>
                              </strong>
                            </span>
                          </strong>
                        </span>
                        &nbsp;
                      </strong>
                      INTELLECTUAL PROPERTY RIGHTS
                    </span>
                  </strong>
                </div>
              </div>
              <div align="center" style={{ textAlign: 'left', lineHeight: 1 }}>
                <br />
              </div>
              <div align="center" style={{ textAlign: 'left' }}>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5' }}
                >
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    Unless otherwise indicated, the Site is our proprietary
                    property and all source code, databases, functionality,
                    software, website designs, audio, video, text, photographs,
                    and graphics on the Site (collectively, the “Content”) and
                    the trademarks, service marks, and logos contained therein
                    (the “Marks”) are owned or controlled by us or licensed to
                    us, and are protected by copyright and trademark laws and
                    various other intellectual property rights and unfair
                    competition laws of the United States, international
                    copyright laws, and international conventions. The Content
                    and the Marks are provided on the Site “AS IS” for your
                    information and personal use only. Except as expressly
                    provided in these Terms of Use, no part of the Site and no
                    Content or Marks may be copied, reproduced, aggregated,
                    republished, uploaded, posted, publicly displayed, encoded,
                    translated, transmitted, distributed, sold, licensed, or
                    otherwise exploited for any commercial purpose whatsoever,
                    without our express prior written permission.
                  </span>
                </div>
              </div>
              <div align="center" style={{ textAlign: 'left', lineHeight: 1 }}>
                <br />
              </div>
              <div align="center" style={{ textAlign: 'left' }}>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5' }}
                >
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    Provided that you are eligible to use the Site, you are
                    granted a limited license to access and use the Site and to
                    download or print a copy of any portion of the Content to
                    which you have properly gained access solely for your
                    personal, non-commercial use. We reserve all rights not
                    expressly granted to you in and to the Site, the Content and
                    the Marks.
                  </span>
                </div>
              </div>
              <div
                align="center"
                style={{ textAlign: 'left', lineHeight: '1.5' }}
              >
                <br />
              </div>
              <div
                align="center"
                style={{ textAlign: 'left', lineHeight: '1.5' }}
              >
                <br />
              </div>
              <div align="center" style={{ textAlign: 'left' }}>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_1"
                  id="userreps"
                  style={{ lineHeight: '1.5' }}
                >
                  <a name="_5hg7kgyv9l8z" />
                  <strong>
                    <span
                      style={{
                        lineHeight: '115%',
                        fontFamily: 'Arial',
                        fontSize: 19,
                      }}
                    >
                      <strong>
                        <span
                          style={{
                            lineHeight: '115%',
                            fontFamily: 'Arial',
                            fontSize: 19,
                          }}
                        >
                          <strong>
                            <span
                              style={{
                                lineHeight: '115%',
                                fontFamily: 'Arial',
                                fontSize: 19,
                              }}
                            >
                              <strong>
                                <span
                                  style={{
                                    lineHeight: '115%',
                                    fontFamily: 'Arial',
                                    fontSize: 19,
                                  }}
                                >
                                  3.
                                </span>
                              </strong>
                            </span>
                          </strong>
                        </span>
                        &nbsp;
                      </strong>
                      USER REPRESENTATIONS
                    </span>
                  </strong>
                </div>
              </div>
              <div align="center" style={{ textAlign: 'left', lineHeight: 1 }}>
                <br />
              </div>
              <div align="center" style={{ textAlign: 'left' }}>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5' }}
                >
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    By using the Site, you represent and warrant that:
                  </span>
                  <span
                    className="block-container if"
                    data-type="if"
                    id="d2d82ca8-275f-3f86-8149-8a5ef8054af6"
                  >
                    <span data-type="conditional-block">
                      <span
                        className="block-component"
                        data-record-question-key="user_account_option"
                        data-type="statement"
                      />{' '}
                      <span data-type="body">
                        <span
                          style={{ color: 'rgb(89, 89, 89)', fontSize: '11pt' }}
                        >
                          (
                        </span>
                        <span
                          style={{
                            color: 'rgb(89, 89, 89)',
                            fontSize: '14.6667px',
                          }}
                        >
                          1
                        </span>
                        <span
                          style={{ color: 'rgb(89, 89, 89)', fontSize: '11pt' }}
                        >
                          ) all registration information you submit will be
                          true, accurate, current, and complete; (
                        </span>
                        <span
                          style={{
                            color: 'rgb(89, 89, 89)',
                            fontSize: '14.6667px',
                          }}
                        >
                          2
                        </span>
                        <span
                          style={{ color: 'rgb(89, 89, 89)', fontSize: '11pt' }}
                        >
                          ) you will maintain the accuracy of such information
                          and promptly update such registration information as
                          necessary;
                        </span>
                      </span>
                    </span>
                    <span
                      className="statement-end-if-in-editor"
                      data-type="close"
                    />
                    &nbsp;
                  </span>
                  <span style={{ color: 'rgb(89, 89, 89)', fontSize: '11pt' }}>
                    (
                  </span>
                  <span
                    style={{ color: 'rgb(89, 89, 89)', fontSize: '14.6667px' }}
                  >
                    3
                  </span>
                  <span style={{ color: 'rgb(89, 89, 89)', fontSize: '11pt' }}>
                    ) you have the legal capacity and you agree to comply with
                    these Terms of Use;
                  </span>
                  <span
                    className="block-container if"
                    data-type="if"
                    id="8d4c883b-bc2c-f0b4-da3e-6d0ee51aca13"
                  >
                    <span data-type="conditional-block">
                      <span
                        className="block-component"
                        data-record-question-key="user_u13_option"
                        data-type="statement"
                      />{' '}
                      <span data-type="body">
                        <span
                          style={{ color: 'rgb(89, 89, 89)', fontSize: '11pt' }}
                        >
                          (
                        </span>
                        <span
                          style={{
                            color: 'rgb(89, 89, 89)',
                            fontSize: '14.6667px',
                          }}
                        >
                          4
                        </span>
                        <span
                          style={{ color: 'rgb(89, 89, 89)', fontSize: '11pt' }}
                        >
                          ) you are not under the age of 13;
                        </span>
                      </span>
                    </span>
                    <span
                      className="statement-end-if-in-editor"
                      data-type="close"
                    />
                    &nbsp;
                  </span>
                  <span style={{ color: 'rgb(89, 89, 89)', fontSize: '11pt' }}>
                    (
                  </span>
                  <span
                    style={{ color: 'rgb(89, 89, 89)', fontSize: '14.6667px' }}
                  >
                    5
                  </span>
                  <span style={{ color: 'rgb(89, 89, 89)', fontSize: '11pt' }}>
                    ) you are not a minor in the jurisdiction in which you
                    reside
                    <span
                      className="block-container if"
                      data-type="if"
                      id="76948fab-ec9e-266a-bb91-948929c050c9"
                    >
                      <span data-type="conditional-block">
                        <span
                          className="block-component"
                          data-record-question-key="user_o18_option"
                          data-type="statement"
                        />
                        <span data-type="body">
                          , or if a minor, you have received parental permission
                          to use the Site
                        </span>
                      </span>
                      <span
                        className="statement-end-if-in-editor"
                        data-type="close"
                      />
                    </span>
                    ; (
                  </span>
                  <span
                    style={{ color: 'rgb(89, 89, 89)', fontSize: '14.6667px' }}
                  >
                    6
                  </span>
                  <span style={{ color: 'rgb(89, 89, 89)', fontSize: '11pt' }}>
                    ) you will not access the Site through automated or
                    non-human means, whether through a bot, script or otherwise;
                    (
                  </span>
                  <span
                    style={{ color: 'rgb(89, 89, 89)', fontSize: '14.6667px' }}
                  >
                    7
                  </span>
                  <span style={{ color: 'rgb(89, 89, 89)', fontSize: '11pt' }}>
                    ) you will not use the Site for any illegal or unauthorized
                    purpose; and (
                  </span>
                  <span
                    style={{ color: 'rgb(89, 89, 89)', fontSize: '14.6667px' }}
                  >
                    8
                  </span>
                  <span style={{ color: 'rgb(89, 89, 89)', fontSize: '11pt' }}>
                    ) your use of the Site will not violate any applicable law
                    or regulation.
                  </span>
                  <span
                    style={{ color: 'rgb(89, 89, 89)', fontSize: '14.6667px' }}
                  />
                </div>
              </div>
              <div align="center" style={{ textAlign: 'left', lineHeight: 1 }}>
                <br />
              </div>
              <div align="center" style={{ textAlign: 'left' }}>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: '115%' }}
                >
                  <div className="MsoNormal" style={{ lineHeight: '17.25px' }}>
                    <div
                      className="MsoNormal"
                      data-custom-class="body_text"
                      style={{ lineHeight: '1.5', textAlign: 'left' }}
                    >
                      <span
                        style={{
                          fontSize: '11pt',
                          lineHeight: '16.8667px',
                          color: 'rgb(89, 89, 89)',
                        }}
                      >
                        If you provide any information that is untrue,
                        inaccurate, not current, or incomplete, we have the
                        right to suspend or terminate your account and refuse
                        any and all current or future use of the Site (or any
                        portion thereof).
                      </span>
                    </div>
                    <div
                      className="MsoNormal"
                      style={{ lineHeight: '1.1', textAlign: 'left' }}
                    >
                      <span className="block-component" />
                    </div>
                    <div
                      className="MsoNormal"
                      style={{ lineHeight: '1.5', textAlign: 'left' }}
                    >
                      <br />
                    </div>
                    <div
                      className="MsoNormal"
                      style={{ lineHeight: '1.5', textAlign: 'left' }}
                    >
                      <br />
                    </div>
                  </div>
                  <div className="MsoNormal" style={{ lineHeight: 1 }}>
                    <span data-type="conditional-block">
                      <span data-type="body">
                        <div
                          className="MsoNormal"
                          data-custom-class="heading_1"
                          id="userreg"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <strong>
                            <span
                              style={{ lineHeight: '24.5333px', fontSize: 19 }}
                            >
                              <strong>
                                <span
                                  style={{
                                    lineHeight: '115%',
                                    fontFamily: 'Arial',
                                    fontSize: 19,
                                  }}
                                >
                                  <strong>
                                    <span
                                      style={{
                                        lineHeight: '115%',
                                        fontFamily: 'Arial',
                                        fontSize: 19,
                                      }}
                                    >
                                      <strong>
                                        <span
                                          style={{
                                            lineHeight: '115%',
                                            fontFamily: 'Arial',
                                            fontSize: 19,
                                          }}
                                        >
                                          4.
                                        </span>
                                      </strong>
                                    </span>
                                  </strong>
                                </span>
                                &nbsp;
                              </strong>
                              USER REGISTRATION
                            </span>
                          </strong>
                        </div>
                      </span>
                    </span>
                  </div>
                  <div className="MsoNormal" style={{ lineHeight: 1 }}>
                    <br />
                  </div>
                  <div className="MsoNormal" style={{ lineHeight: 1 }}>
                    <span data-type="conditional-block">
                      <span data-type="body">
                        <div
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ textAlign: 'left', lineHeight: '1.5' }}
                        >
                          <span
                            style={{
                              fontSize: '11pt',
                              lineHeight: '16.8667px',
                              color: 'rgb(89, 89, 89)',
                            }}
                          >
                            You may be required to register with the Site. You
                            agree to keep your password confidential and will be
                            responsible for all use of your account and
                            password. We reserve the right to remove, reclaim,
                            or change a username you select if we determine, in
                            our sole discretion, that such username is
                            inappropriate, obscene, or otherwise objectionable.
                            <span
                              className="statement-end-if-in-editor"
                              data-type="close"
                            />
                          </span>
                        </div>
                      </span>
                    </span>
                  </div>
                  <div className="MsoNormal" style={{ lineHeight: '1.5' }}>
                    <br />
                  </div>
                  <div className="MsoNormal" style={{ lineHeight: '1.5' }}>
                    <br />
                  </div>
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_1"
                  id="products"
                  style={{ lineHeight: '1.5' }}
                >
                  <a name="_nds4qylockxx" />
                  <strong>
                    <span
                      style={{
                        lineHeight: '115%',
                        fontFamily: 'Arial',
                        fontSize: 19,
                      }}
                    >
                      <strong>
                        <span
                          style={{
                            lineHeight: '115%',
                            fontFamily: 'Arial',
                            fontSize: 19,
                          }}
                        >
                          <strong>
                            <span
                              style={{
                                lineHeight: '115%',
                                fontFamily: 'Arial',
                                fontSize: 19,
                              }}
                            >
                              <strong>
                                <span
                                  style={{
                                    lineHeight: '115%',
                                    fontFamily: 'Arial',
                                    fontSize: 19,
                                  }}
                                >
                                  5.
                                </span>
                              </strong>
                            </span>
                          </strong>
                        </span>
                        &nbsp;
                      </strong>
                      PRODUCTS
                    </span>
                  </strong>
                </div>
              </div>
              <div align="center" style={{ textAlign: 'left', lineHeight: 1 }}>
                <br />
              </div>
              <div align="center" style={{ textAlign: 'left' }}>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5' }}
                >
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    <span
                      className="block-container if"
                      data-type="if"
                      id="b9812c02-490b-3a1e-9b3a-9a03c73ee63c"
                    >
                      <span data-type="conditional-block">
                        <span
                          className="block-component"
                          data-record-question-key="product_option"
                          data-type="statement"
                        />
                      </span>
                      All products are subject to availability
                      <span
                        className="block-container if"
                        data-type="if"
                        id="35c07bc8-4217-594b-b7e7-1b4f0e8c56e4"
                      >
                        <span data-type="conditional-block">
                          <span
                            className="block-component"
                            data-record-question-key="product_option"
                            data-type="statement"
                          />
                        </span>
                        . We reserve the right to discontinue any products at
                        any time for any reason. Prices for all products are
                        subject to change.
                      </span>
                    </span>
                  </span>
                </div>
              </div>
              <div
                align="center"
                style={{ textAlign: 'left', lineHeight: '1.5' }}
              >
                <br />
              </div>
              <div
                align="center"
                style={{ textAlign: 'left', lineHeight: '1.5' }}
              >
                <br />
              </div>
              <div align="center" style={{ textAlign: 'left' }}>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_1"
                  id="purchases"
                  style={{ lineHeight: '1.5' }}
                >
                  <a name="_ynub0jdx8pob" />
                  <strong>
                    <span
                      style={{
                        lineHeight: '115%',
                        fontFamily: 'Arial',
                        fontSize: 19,
                      }}
                    >
                      <strong>
                        <span
                          style={{
                            lineHeight: '115%',
                            fontFamily: 'Arial',
                            fontSize: 19,
                          }}
                        >
                          <strong>
                            <span
                              style={{
                                lineHeight: '115%',
                                fontFamily: 'Arial',
                                fontSize: 19,
                              }}
                            >
                              <strong>
                                <span
                                  style={{
                                    lineHeight: '115%',
                                    fontFamily: 'Arial',
                                    fontSize: 19,
                                  }}
                                >
                                  6.
                                </span>
                              </strong>
                            </span>
                          </strong>
                        </span>
                        &nbsp;
                      </strong>
                      PURCHASES AND PAYMENT
                    </span>
                  </strong>
                </div>
              </div>
              <div align="center" style={{ textAlign: 'left', lineHeight: 1 }}>
                <br />
              </div>
              <div align="center" style={{ textAlign: 'left' }}>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5' }}
                >
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    We accept the following forms of payment:
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: '115%' }}
                >
                  <div
                    className="MsoNormal"
                    style={{ textAlign: 'left', lineHeight: 1 }}
                  >
                    <br />
                  </div>
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5', marginLeft: 20 }}
                >
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    <span className="forloop-component" />- &nbsp;
                    <span className="question">Visa</span>
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5', marginLeft: 20 }}
                >
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    <span className="forloop-component" />- &nbsp;
                    <span className="question">Mastercard</span>
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5', marginLeft: 20 }}
                >
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    <span className="forloop-component" />- &nbsp;
                    <span className="question">Discover</span>
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5', marginLeft: 20 }}
                >
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    <span className="forloop-component" />- &nbsp;
                    <span className="question">American Express</span>
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5', marginLeft: 20 }}
                >
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    <span className="forloop-component" />
                  </span>
                </div>
                <div className="MsoNormal" style={{ lineHeight: 1 }}>
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    <br />
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5' }}
                >
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    You agree to provide current, complete, and accurate
                    purchase and account information for all purchases made via
                    the Site. You further agree to promptly update account and
                    payment information, including email address, payment
                    method, and payment card expiration date, so that we can
                    complete your transactions and contact you as needed. Sales
                    tax will be added to the price of purchases as deemed
                    required by us. We may change prices at any time. All
                    payments shall be&nbsp;
                  </span>
                  <span
                    style={{
                      fontSize: 15,
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: 'rgb(89, 89, 89)',
                    }}
                  >
                    in <span className="question">U.S. dollars</span>.
                  </span>
                </div>
              </div>
              <div align="center" style={{ textAlign: 'left', lineHeight: 1 }}>
                <br />
              </div>
              <div align="center" style={{ textAlign: 'left' }}>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5' }}
                >
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    You agree to pay all charges at the prices then in effect
                    for your purchases and any applicable shipping fees, and you
                    authorize us to charge your chosen payment provider for any
                    such amounts upon placing your order.{' '}
                    <span
                      className="block-container if"
                      data-type="if"
                      id="9c0216a1-d094-fd73-a062-9615dc795ffc"
                    >
                      <span data-type="conditional-block">
                        <span
                          className="block-component"
                          data-record-question-key="recurring_charge_option"
                          data-type="statement"
                        />
                      </span>
                      We reserve the right to correct any errors or mistakes in
                      pricing, even if we have already requested or received
                      payment.
                    </span>
                  </span>
                </div>
              </div>
              <div align="center" style={{ textAlign: 'left', lineHeight: 1 }}>
                <br />
              </div>
              <div align="center" style={{ textAlign: 'left' }}>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5' }}
                >
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    We reserve the right to refuse any order placed through the
                    Site. We may, in our sole discretion, limit or cancel
                    quantities purchased per person, per household, or per
                    order. These restrictions may include orders placed by or
                    under the same customer account, the same payment method,
                    and/or orders that use the same billing or shipping address.
                    We reserve the right to limit or prohibit orders that, in
                    our sole judgment, appear to be placed by dealers,
                    resellers, or distributors.
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: '115%' }}
                >
                  <span
                    style={{
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: 'rgb(89, 89, 89)',
                    }}
                  >
                    <span
                      data-type="conditional-block"
                      style={{ color: 'rgb(10, 54, 90)', textAlign: 'left' }}
                    >
                      <span
                        className="block-component"
                        data-record-question-key="return_option"
                        data-type="statement"
                        style={{ fontSize: 15 }}
                      />
                    </span>
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: '1.5' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: '1.5' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  id="returnrefunds"
                  style={{ textAlign: 'justify', lineHeight: 1 }}
                >
                  <span
                    style={{
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: 'rgb(89, 89, 89)',
                    }}
                  >
                    <span
                      data-type="conditional-block"
                      style={{ color: 'rgb(10, 54, 90)', textAlign: 'left' }}
                    >
                      <span data-type="body">
                        <div
                          className="MsoNormal"
                          data-custom-class="heading_1"
                          style={{ lineHeight: '1.5' }}
                        >
                          <strong>
                            <span style={{ lineHeight: '24.5333px' }}>
                              <span
                                className="block-container if"
                                data-type="if"
                                id="09a19ea5-53d7-8b08-be6e-279bf01450e1"
                              >
                                <span data-type="conditional-block">
                                  <span style={{ fontSize: 19 }}>
                                    <span data-type="body">
                                      <span className="block-component">
                                        <strong>
                                          <span
                                            style={{
                                              lineHeight: '115%',
                                              fontFamily: 'Arial',
                                              fontSize: 19,
                                            }}
                                          >
                                            <strong>
                                              <span
                                                style={{
                                                  lineHeight: '115%',
                                                  fontFamily: 'Arial',
                                                  fontSize: 19,
                                                }}
                                              >
                                                <strong>
                                                  <span
                                                    style={{
                                                      lineHeight: '115%',
                                                      fontFamily: 'Arial',
                                                      fontSize: 19,
                                                    }}
                                                  >
                                                    7.
                                                  </span>
                                                </strong>
                                              </span>
                                            </strong>
                                          </span>
                                          &nbsp;
                                        </strong>
                                      </span>
                                      <span data-type="body">REFUNDS</span>
                                    </span>
                                    <span data-type="conditional-block">
                                      <span
                                        className="block-component"
                                        data-record-question-key="null"
                                        data-type="statement"
                                      />
                                    </span>
                                  </span>
                                </span>
                                <span style={{ fontSize: 19 }}>
                                  &nbsp;POLICY
                                </span>
                              </span>
                            </span>
                          </strong>
                        </div>
                      </span>
                    </span>
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: 1 }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: 1 }}
                >
                  <span
                    style={{
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: 'rgb(89, 89, 89)',
                    }}
                  >
                    <span
                      data-type="conditional-block"
                      style={{ color: 'rgb(10, 54, 90)', textAlign: 'left' }}
                    >
                      <span data-type="body">
                        <div
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ fontSize: 15, lineHeight: '1.5' }}
                        >
                          <span
                            style={{
                              fontSize: '11pt',
                              lineHeight: '16.8667px',
                              color: 'rgb(89, 89, 89)',
                            }}
                          >
                            All sales are final and no refund will be issued.
                            <span
                              style={{
                                lineHeight: '115%',
                                fontFamily: 'Arial',
                                color: 'rgb(89, 89, 89)',
                              }}
                            >
                              <span
                                className="statement-end-if-in-editor"
                                data-type="close"
                                style={{ fontSize: 15, textAlign: 'left' }}
                              />
                            </span>
                          </span>
                        </div>
                      </span>
                    </span>
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: '1.5' }}
                >
                  <span
                    style={{
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: 'rgb(89, 89, 89)',
                    }}
                  >
                    <span
                      data-type="conditional-block"
                      style={{ color: 'rgb(10, 54, 90)', textAlign: 'left' }}
                    >
                      <span data-type="body">
                        <div
                          className="MsoNormal"
                          style={{ fontSize: 15, lineHeight: '1.5' }}
                        >
                          <br />
                        </div>
                      </span>
                    </span>
                    <br />
                  </span>{' '}
                  <a name="_h284p8mrs3r7" />
                  <div
                    className="MsoNormal"
                    data-custom-class="heading_1"
                    id="prohibited"
                    style={{ textAlign: 'left', lineHeight: '1.5' }}
                  >
                    <strong>
                      <span style={{ lineHeight: '24.5333px', fontSize: 19 }}>
                        <strong>
                          <span
                            style={{
                              lineHeight: '115%',
                              fontFamily: 'Arial',
                              fontSize: 19,
                            }}
                          >
                            <strong>
                              <span
                                style={{
                                  lineHeight: '115%',
                                  fontFamily: 'Arial',
                                  fontSize: 19,
                                }}
                              >
                                <strong>
                                  <span
                                    style={{
                                      lineHeight: '115%',
                                      fontFamily: 'Arial',
                                      fontSize: 19,
                                    }}
                                  >
                                    8.
                                  </span>
                                </strong>
                              </span>
                            </strong>
                          </span>
                          &nbsp;
                        </strong>
                        PROHIBITED ACTIVITIES
                      </span>
                    </strong>
                  </div>
                </div>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: 1 }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: 1 }}
                >
                  <div
                    className="MsoNormal"
                    data-custom-class="body_text"
                    style={{ lineHeight: '1.5', textAlign: 'left' }}
                  >
                    <span
                      style={{
                        fontSize: '11pt',
                        lineHeight: '16.8667px',
                        color: 'rgb(89, 89, 89)',
                      }}
                    >
                      You may not access or use the Site for any purpose other
                      than that for which we make the Site available. The Site
                      may not be used in connection with any commercial
                      endeavors except those that are specifically endorsed or
                      approved by us.
                    </span>
                  </div>
                </div>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: 1 }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: 1 }}
                >
                  <div className="MsoNormal" style={{ lineHeight: '17.25px' }}>
                    <div className="MsoNormal" style={{ lineHeight: '1.1' }}>
                      <div
                        className="MsoNormal"
                        style={{ lineHeight: '17.25px' }}
                      >
                        <div
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <span
                            style={{
                              fontSize: '11pt',
                              lineHeight: '16.8667px',
                              color: 'rgb(89, 89, 89)',
                            }}
                          >
                            As a user of the Site, you agree not to:
                          </span>
                        </div>
                      </div>
                      <ul>
                        <li
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <span
                            style={{
                              fontSize: '11pt',
                              lineHeight: '16.8667px',
                              color: 'rgb(89, 89, 89)',
                            }}
                          >
                            <span
                              style={{
                                fontFamily: 'sans-serif',
                                fontSize: 15,
                                fontStyle: 'normal',
                                fontVariantLigatures: 'normal',
                                fontVariantCaps: 'normal',
                                fontWeight: 400,
                                letterSpacing: 'normal',
                                orphans: 2,
                                textAlign: 'justify',
                                textIndent: '-29.4px',
                                textTransform: 'none',
                                whiteSpace: 'normal',
                                widows: 2,
                                wordSpacing: 0,
                                WebkitTextStrokeWidth: 0,
                                backgroundColor: 'rgb(255, 255, 255)',
                                textDecorationStyle: 'initial',
                                textDecorationColor: 'initial',
                                color: 'rgb(89, 89, 89)',
                              }}
                            >
                              Systematically retrieve data or other content from
                              the Site to create or compile, directly or
                              indirectly, a collection, compilation, database,
                              or directory without written permission from us.
                            </span>
                          </span>
                        </li>
                        <li
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <span style={{ fontSize: 15 }}>
                            <span
                              style={{
                                lineHeight: '16.8667px',
                                color: 'rgb(89, 89, 89)',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'sans-serif',
                                  fontStyle: 'normal',
                                  fontVariantLigatures: 'normal',
                                  fontVariantCaps: 'normal',
                                  fontWeight: 400,
                                  letterSpacing: 'normal',
                                  orphans: 2,
                                  textAlign: 'justify',
                                  textIndent: '-29.4px',
                                  textTransform: 'none',
                                  whiteSpace: 'normal',
                                  widows: 2,
                                  wordSpacing: 0,
                                  WebkitTextStrokeWidth: 0,
                                  backgroundColor: 'rgb(255, 255, 255)',
                                  textDecorationStyle: 'initial',
                                  textDecorationColor: 'initial',
                                  color: 'rgb(89, 89, 89)',
                                }}
                              >
                                <span
                                  style={{
                                    lineHeight: '16.8667px',
                                    color: 'rgb(89, 89, 89)',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: 'sans-serif',
                                      fontStyle: 'normal',
                                      fontVariantLigatures: 'normal',
                                      fontVariantCaps: 'normal',
                                      fontWeight: 400,
                                      letterSpacing: 'normal',
                                      orphans: 2,
                                      textAlign: 'justify',
                                      textIndent: '-29.4px',
                                      textTransform: 'none',
                                      whiteSpace: 'normal',
                                      widows: 2,
                                      wordSpacing: 0,
                                      WebkitTextStrokeWidth: 0,
                                      backgroundColor: 'rgb(255, 255, 255)',
                                      textDecorationStyle: 'initial',
                                      textDecorationColor: 'initial',
                                      color: 'rgb(89, 89, 89)',
                                    }}
                                  >
                                    Trick, defraud, or mislead us and other
                                    users, especially in any attempt to learn
                                    sensitive account information such as user
                                    passwords.
                                  </span>
                                </span>
                              </span>
                            </span>
                          </span>
                        </li>
                        <li
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <span style={{ fontSize: 15 }}>
                            <span
                              style={{
                                lineHeight: '16.8667px',
                                color: 'rgb(89, 89, 89)',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'sans-serif',
                                  fontStyle: 'normal',
                                  fontVariantLigatures: 'normal',
                                  fontVariantCaps: 'normal',
                                  fontWeight: 400,
                                  letterSpacing: 'normal',
                                  orphans: 2,
                                  textAlign: 'justify',
                                  textIndent: '-29.4px',
                                  textTransform: 'none',
                                  whiteSpace: 'normal',
                                  widows: 2,
                                  wordSpacing: 0,
                                  WebkitTextStrokeWidth: 0,
                                  backgroundColor: 'rgb(255, 255, 255)',
                                  textDecorationStyle: 'initial',
                                  textDecorationColor: 'initial',
                                  color: 'rgb(89, 89, 89)',
                                }}
                              >
                                <span
                                  style={{
                                    lineHeight: '16.8667px',
                                    color: 'rgb(89, 89, 89)',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: 'sans-serif',
                                      fontStyle: 'normal',
                                      fontVariantLigatures: 'normal',
                                      fontVariantCaps: 'normal',
                                      fontWeight: 400,
                                      letterSpacing: 'normal',
                                      orphans: 2,
                                      textAlign: 'justify',
                                      textIndent: '-29.4px',
                                      textTransform: 'none',
                                      whiteSpace: 'normal',
                                      widows: 2,
                                      wordSpacing: 0,
                                      WebkitTextStrokeWidth: 0,
                                      backgroundColor: 'rgb(255, 255, 255)',
                                      textDecorationStyle: 'initial',
                                      textDecorationColor: 'initial',
                                      color: 'rgb(89, 89, 89)',
                                    }}
                                  >
                                    Circumvent, disable, or otherwise interfere
                                    with security-related features of the Site,
                                    including features that prevent or restrict
                                    the use or copying of any Content or enforce
                                    limitations on the use of the Site and/or
                                    the Content contained therein.
                                  </span>
                                </span>
                              </span>
                            </span>
                          </span>
                        </li>
                        <li
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <span style={{ fontSize: 15 }}>
                            <span
                              style={{
                                lineHeight: '16.8667px',
                                color: 'rgb(89, 89, 89)',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'sans-serif',
                                  fontStyle: 'normal',
                                  fontVariantLigatures: 'normal',
                                  fontVariantCaps: 'normal',
                                  fontWeight: 400,
                                  letterSpacing: 'normal',
                                  orphans: 2,
                                  textAlign: 'justify',
                                  textIndent: '-29.4px',
                                  textTransform: 'none',
                                  whiteSpace: 'normal',
                                  widows: 2,
                                  wordSpacing: 0,
                                  WebkitTextStrokeWidth: 0,
                                  backgroundColor: 'rgb(255, 255, 255)',
                                  textDecorationStyle: 'initial',
                                  textDecorationColor: 'initial',
                                  color: 'rgb(89, 89, 89)',
                                }}
                              >
                                <span
                                  style={{
                                    lineHeight: '16.8667px',
                                    color: 'rgb(89, 89, 89)',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: 'sans-serif',
                                      fontStyle: 'normal',
                                      fontVariantLigatures: 'normal',
                                      fontVariantCaps: 'normal',
                                      fontWeight: 400,
                                      letterSpacing: 'normal',
                                      orphans: 2,
                                      textAlign: 'justify',
                                      textIndent: '-29.4px',
                                      textTransform: 'none',
                                      whiteSpace: 'normal',
                                      widows: 2,
                                      wordSpacing: 0,
                                      WebkitTextStrokeWidth: 0,
                                      backgroundColor: 'rgb(255, 255, 255)',
                                      textDecorationStyle: 'initial',
                                      textDecorationColor: 'initial',
                                      color: 'rgb(89, 89, 89)',
                                    }}
                                  >
                                    Disparage, tarnish, or otherwise harm, in
                                    our opinion, us and/or the Site.
                                  </span>
                                </span>
                              </span>
                            </span>
                          </span>
                        </li>
                        <li
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <span style={{ fontSize: 15 }}>
                            <span
                              style={{
                                lineHeight: '16.8667px',
                                color: 'rgb(89, 89, 89)',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'sans-serif',
                                  fontStyle: 'normal',
                                  fontVariantLigatures: 'normal',
                                  fontVariantCaps: 'normal',
                                  fontWeight: 400,
                                  letterSpacing: 'normal',
                                  orphans: 2,
                                  textAlign: 'justify',
                                  textIndent: '-29.4px',
                                  textTransform: 'none',
                                  whiteSpace: 'normal',
                                  widows: 2,
                                  wordSpacing: 0,
                                  WebkitTextStrokeWidth: 0,
                                  backgroundColor: 'rgb(255, 255, 255)',
                                  textDecorationStyle: 'initial',
                                  textDecorationColor: 'initial',
                                  color: 'rgb(89, 89, 89)',
                                }}
                              >
                                <span
                                  style={{
                                    lineHeight: '16.8667px',
                                    color: 'rgb(89, 89, 89)',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: 'sans-serif',
                                      fontStyle: 'normal',
                                      fontVariantLigatures: 'normal',
                                      fontVariantCaps: 'normal',
                                      fontWeight: 400,
                                      letterSpacing: 'normal',
                                      orphans: 2,
                                      textAlign: 'justify',
                                      textIndent: '-29.4px',
                                      textTransform: 'none',
                                      whiteSpace: 'normal',
                                      widows: 2,
                                      wordSpacing: 0,
                                      WebkitTextStrokeWidth: 0,
                                      backgroundColor: 'rgb(255, 255, 255)',
                                      textDecorationStyle: 'initial',
                                      textDecorationColor: 'initial',
                                      color: 'rgb(89, 89, 89)',
                                    }}
                                  >
                                    Use any information obtained from the Site
                                    in order to harass, abuse, or harm another
                                    person.
                                  </span>
                                </span>
                              </span>
                            </span>
                          </span>
                        </li>
                        <li
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <span style={{ fontSize: 15 }}>
                            <span
                              style={{
                                lineHeight: '16.8667px',
                                color: 'rgb(89, 89, 89)',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'sans-serif',
                                  fontStyle: 'normal',
                                  fontVariantLigatures: 'normal',
                                  fontVariantCaps: 'normal',
                                  fontWeight: 400,
                                  letterSpacing: 'normal',
                                  orphans: 2,
                                  textAlign: 'justify',
                                  textIndent: '-29.4px',
                                  textTransform: 'none',
                                  whiteSpace: 'normal',
                                  widows: 2,
                                  wordSpacing: 0,
                                  WebkitTextStrokeWidth: 0,
                                  backgroundColor: 'rgb(255, 255, 255)',
                                  textDecorationStyle: 'initial',
                                  textDecorationColor: 'initial',
                                  color: 'rgb(89, 89, 89)',
                                }}
                              >
                                <span
                                  style={{
                                    lineHeight: '16.8667px',
                                    color: 'rgb(89, 89, 89)',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: 'sans-serif',
                                      fontStyle: 'normal',
                                      fontVariantLigatures: 'normal',
                                      fontVariantCaps: 'normal',
                                      fontWeight: 400,
                                      letterSpacing: 'normal',
                                      orphans: 2,
                                      textAlign: 'justify',
                                      textIndent: '-29.4px',
                                      textTransform: 'none',
                                      whiteSpace: 'normal',
                                      widows: 2,
                                      wordSpacing: 0,
                                      WebkitTextStrokeWidth: 0,
                                      backgroundColor: 'rgb(255, 255, 255)',
                                      textDecorationStyle: 'initial',
                                      textDecorationColor: 'initial',
                                      color: 'rgb(89, 89, 89)',
                                    }}
                                  >
                                    Make improper use of our support services or
                                    submit false reports of abuse or misconduct.
                                  </span>
                                </span>
                              </span>
                            </span>
                          </span>
                        </li>
                        <li
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <span style={{ fontSize: 15 }}>
                            <span
                              style={{
                                lineHeight: '16.8667px',
                                color: 'rgb(89, 89, 89)',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'sans-serif',
                                  fontStyle: 'normal',
                                  fontVariantLigatures: 'normal',
                                  fontVariantCaps: 'normal',
                                  fontWeight: 400,
                                  letterSpacing: 'normal',
                                  orphans: 2,
                                  textAlign: 'justify',
                                  textIndent: '-29.4px',
                                  textTransform: 'none',
                                  whiteSpace: 'normal',
                                  widows: 2,
                                  wordSpacing: 0,
                                  WebkitTextStrokeWidth: 0,
                                  backgroundColor: 'rgb(255, 255, 255)',
                                  textDecorationStyle: 'initial',
                                  textDecorationColor: 'initial',
                                  color: 'rgb(89, 89, 89)',
                                }}
                              >
                                <span
                                  style={{
                                    lineHeight: '16.8667px',
                                    color: 'rgb(89, 89, 89)',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: 'sans-serif',
                                      fontStyle: 'normal',
                                      fontVariantLigatures: 'normal',
                                      fontVariantCaps: 'normal',
                                      fontWeight: 400,
                                      letterSpacing: 'normal',
                                      orphans: 2,
                                      textAlign: 'justify',
                                      textIndent: '-29.4px',
                                      textTransform: 'none',
                                      whiteSpace: 'normal',
                                      widows: 2,
                                      wordSpacing: 0,
                                      WebkitTextStrokeWidth: 0,
                                      backgroundColor: 'rgb(255, 255, 255)',
                                      textDecorationStyle: 'initial',
                                      textDecorationColor: 'initial',
                                      color: 'rgb(89, 89, 89)',
                                    }}
                                  >
                                    Use the Site in a manner inconsistent with
                                    any applicable laws or regulations.
                                  </span>
                                </span>
                              </span>
                            </span>
                          </span>
                        </li>
                        <li
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <span style={{ fontSize: 15 }}>
                            <span
                              style={{
                                lineHeight: '16.8667px',
                                color: 'rgb(89, 89, 89)',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'sans-serif',
                                  fontStyle: 'normal',
                                  fontVariantLigatures: 'normal',
                                  fontVariantCaps: 'normal',
                                  fontWeight: 400,
                                  letterSpacing: 'normal',
                                  orphans: 2,
                                  textAlign: 'justify',
                                  textIndent: '-29.4px',
                                  textTransform: 'none',
                                  whiteSpace: 'normal',
                                  widows: 2,
                                  wordSpacing: 0,
                                  WebkitTextStrokeWidth: 0,
                                  backgroundColor: 'rgb(255, 255, 255)',
                                  textDecorationStyle: 'initial',
                                  textDecorationColor: 'initial',
                                  color: 'rgb(89, 89, 89)',
                                }}
                              >
                                <span
                                  style={{
                                    lineHeight: '16.8667px',
                                    color: 'rgb(89, 89, 89)',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: 'sans-serif',
                                      fontStyle: 'normal',
                                      fontVariantLigatures: 'normal',
                                      fontVariantCaps: 'normal',
                                      fontWeight: 400,
                                      letterSpacing: 'normal',
                                      orphans: 2,
                                      textAlign: 'justify',
                                      textIndent: '-29.4px',
                                      textTransform: 'none',
                                      whiteSpace: 'normal',
                                      widows: 2,
                                      wordSpacing: 0,
                                      WebkitTextStrokeWidth: 0,
                                      backgroundColor: 'rgb(255, 255, 255)',
                                      textDecorationStyle: 'initial',
                                      textDecorationColor: 'initial',
                                      color: 'rgb(89, 89, 89)',
                                    }}
                                  >
                                    Engage in unauthorized framing of or linking
                                    to the Site.
                                  </span>
                                </span>
                              </span>
                            </span>
                          </span>
                        </li>
                        <li
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <span style={{ fontSize: 15 }}>
                            <span
                              style={{
                                lineHeight: '16.8667px',
                                color: 'rgb(89, 89, 89)',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'sans-serif',
                                  fontStyle: 'normal',
                                  fontVariantLigatures: 'normal',
                                  fontVariantCaps: 'normal',
                                  fontWeight: 400,
                                  letterSpacing: 'normal',
                                  orphans: 2,
                                  textAlign: 'justify',
                                  textIndent: '-29.4px',
                                  textTransform: 'none',
                                  whiteSpace: 'normal',
                                  widows: 2,
                                  wordSpacing: 0,
                                  WebkitTextStrokeWidth: 0,
                                  backgroundColor: 'rgb(255, 255, 255)',
                                  textDecorationStyle: 'initial',
                                  textDecorationColor: 'initial',
                                  color: 'rgb(89, 89, 89)',
                                }}
                              >
                                <span
                                  style={{
                                    lineHeight: '16.8667px',
                                    color: 'rgb(89, 89, 89)',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: 'sans-serif',
                                      fontStyle: 'normal',
                                      fontVariantLigatures: 'normal',
                                      fontVariantCaps: 'normal',
                                      fontWeight: 400,
                                      letterSpacing: 'normal',
                                      orphans: 2,
                                      textAlign: 'justify',
                                      textIndent: '-29.4px',
                                      textTransform: 'none',
                                      whiteSpace: 'normal',
                                      widows: 2,
                                      wordSpacing: 0,
                                      WebkitTextStrokeWidth: 0,
                                      backgroundColor: 'rgb(255, 255, 255)',
                                      textDecorationStyle: 'initial',
                                      textDecorationColor: 'initial',
                                      color: 'rgb(89, 89, 89)',
                                    }}
                                  >
                                    Upload or transmit (or attempt to upload or
                                    to transmit) viruses, Trojan horses, or
                                    other material, including excessive use of
                                    capital letters and spamming (continuous
                                    posting of repetitive text), that interferes
                                    with any party’s uninterrupted use and
                                    enjoyment of the Site or modifies, impairs,
                                    disrupts, alters, or interferes with the
                                    use, features, functions, operation, or
                                    maintenance of the Site.
                                  </span>
                                </span>
                              </span>
                            </span>
                          </span>
                        </li>
                        <li
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <span style={{ fontSize: 15 }}>
                            <span
                              style={{
                                lineHeight: '16.8667px',
                                color: 'rgb(89, 89, 89)',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'sans-serif',
                                  fontStyle: 'normal',
                                  fontVariantLigatures: 'normal',
                                  fontVariantCaps: 'normal',
                                  fontWeight: 400,
                                  letterSpacing: 'normal',
                                  orphans: 2,
                                  textAlign: 'justify',
                                  textIndent: '-29.4px',
                                  textTransform: 'none',
                                  whiteSpace: 'normal',
                                  widows: 2,
                                  wordSpacing: 0,
                                  WebkitTextStrokeWidth: 0,
                                  backgroundColor: 'rgb(255, 255, 255)',
                                  textDecorationStyle: 'initial',
                                  textDecorationColor: 'initial',
                                  color: 'rgb(89, 89, 89)',
                                }}
                              >
                                <span
                                  style={{
                                    lineHeight: '16.8667px',
                                    color: 'rgb(89, 89, 89)',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: 'sans-serif',
                                      fontStyle: 'normal',
                                      fontVariantLigatures: 'normal',
                                      fontVariantCaps: 'normal',
                                      fontWeight: 400,
                                      letterSpacing: 'normal',
                                      orphans: 2,
                                      textAlign: 'justify',
                                      textIndent: '-29.4px',
                                      textTransform: 'none',
                                      whiteSpace: 'normal',
                                      widows: 2,
                                      wordSpacing: 0,
                                      WebkitTextStrokeWidth: 0,
                                      backgroundColor: 'rgb(255, 255, 255)',
                                      textDecorationStyle: 'initial',
                                      textDecorationColor: 'initial',
                                      color: 'rgb(89, 89, 89)',
                                    }}
                                  >
                                    Engage in any automated use of the system,
                                    such as using scripts to send comments or
                                    messages, or using any data mining, robots,
                                    or similar data gathering and extraction
                                    tools.
                                  </span>
                                </span>
                              </span>
                            </span>
                          </span>
                        </li>
                        <li
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <span style={{ fontSize: 15 }}>
                            <span
                              style={{
                                lineHeight: '16.8667px',
                                color: 'rgb(89, 89, 89)',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'sans-serif',
                                  fontStyle: 'normal',
                                  fontVariantLigatures: 'normal',
                                  fontVariantCaps: 'normal',
                                  fontWeight: 400,
                                  letterSpacing: 'normal',
                                  orphans: 2,
                                  textAlign: 'justify',
                                  textIndent: '-29.4px',
                                  textTransform: 'none',
                                  whiteSpace: 'normal',
                                  widows: 2,
                                  wordSpacing: 0,
                                  WebkitTextStrokeWidth: 0,
                                  backgroundColor: 'rgb(255, 255, 255)',
                                  textDecorationStyle: 'initial',
                                  textDecorationColor: 'initial',
                                  color: 'rgb(89, 89, 89)',
                                }}
                              >
                                <span
                                  style={{
                                    lineHeight: '16.8667px',
                                    color: 'rgb(89, 89, 89)',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: 'sans-serif',
                                      fontStyle: 'normal',
                                      fontVariantLigatures: 'normal',
                                      fontVariantCaps: 'normal',
                                      fontWeight: 400,
                                      letterSpacing: 'normal',
                                      orphans: 2,
                                      textAlign: 'justify',
                                      textIndent: '-29.4px',
                                      textTransform: 'none',
                                      whiteSpace: 'normal',
                                      widows: 2,
                                      wordSpacing: 0,
                                      WebkitTextStrokeWidth: 0,
                                      backgroundColor: 'rgb(255, 255, 255)',
                                      textDecorationStyle: 'initial',
                                      textDecorationColor: 'initial',
                                      color: 'rgb(89, 89, 89)',
                                    }}
                                  >
                                    Delete the copyright or other proprietary
                                    rights notice from any Content.
                                  </span>
                                </span>
                              </span>
                            </span>
                          </span>
                        </li>
                        <li
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <span style={{ fontSize: 15 }}>
                            <span
                              style={{
                                lineHeight: '16.8667px',
                                color: 'rgb(89, 89, 89)',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'sans-serif',
                                  fontStyle: 'normal',
                                  fontVariantLigatures: 'normal',
                                  fontVariantCaps: 'normal',
                                  fontWeight: 400,
                                  letterSpacing: 'normal',
                                  orphans: 2,
                                  textAlign: 'justify',
                                  textIndent: '-29.4px',
                                  textTransform: 'none',
                                  whiteSpace: 'normal',
                                  widows: 2,
                                  wordSpacing: 0,
                                  WebkitTextStrokeWidth: 0,
                                  backgroundColor: 'rgb(255, 255, 255)',
                                  textDecorationStyle: 'initial',
                                  textDecorationColor: 'initial',
                                  color: 'rgb(89, 89, 89)',
                                }}
                              >
                                <span
                                  style={{
                                    lineHeight: '16.8667px',
                                    color: 'rgb(89, 89, 89)',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: 'sans-serif',
                                      fontStyle: 'normal',
                                      fontVariantLigatures: 'normal',
                                      fontVariantCaps: 'normal',
                                      fontWeight: 400,
                                      letterSpacing: 'normal',
                                      orphans: 2,
                                      textAlign: 'justify',
                                      textIndent: '-29.4px',
                                      textTransform: 'none',
                                      whiteSpace: 'normal',
                                      widows: 2,
                                      wordSpacing: 0,
                                      WebkitTextStrokeWidth: 0,
                                      backgroundColor: 'rgb(255, 255, 255)',
                                      textDecorationStyle: 'initial',
                                      textDecorationColor: 'initial',
                                      color: 'rgb(89, 89, 89)',
                                    }}
                                  >
                                    Attempt to impersonate another user or
                                    person or use the username of another user.
                                  </span>
                                </span>
                              </span>
                            </span>
                          </span>
                        </li>
                        <li
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <span style={{ fontSize: 15 }}>
                            <span
                              style={{
                                lineHeight: '16.8667px',
                                color: 'rgb(89, 89, 89)',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'sans-serif',
                                  fontStyle: 'normal',
                                  fontVariantLigatures: 'normal',
                                  fontVariantCaps: 'normal',
                                  fontWeight: 400,
                                  letterSpacing: 'normal',
                                  orphans: 2,
                                  textAlign: 'justify',
                                  textIndent: '-29.4px',
                                  textTransform: 'none',
                                  whiteSpace: 'normal',
                                  widows: 2,
                                  wordSpacing: 0,
                                  WebkitTextStrokeWidth: 0,
                                  backgroundColor: 'rgb(255, 255, 255)',
                                  textDecorationStyle: 'initial',
                                  textDecorationColor: 'initial',
                                  color: 'rgb(89, 89, 89)',
                                }}
                              >
                                <span
                                  style={{
                                    lineHeight: '16.8667px',
                                    color: 'rgb(89, 89, 89)',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: 'sans-serif',
                                      fontStyle: 'normal',
                                      fontVariantLigatures: 'normal',
                                      fontVariantCaps: 'normal',
                                      fontWeight: 400,
                                      letterSpacing: 'normal',
                                      orphans: 2,
                                      textAlign: 'justify',
                                      textIndent: '-29.4px',
                                      textTransform: 'none',
                                      whiteSpace: 'normal',
                                      widows: 2,
                                      wordSpacing: 0,
                                      WebkitTextStrokeWidth: 0,
                                      backgroundColor: 'rgb(255, 255, 255)',
                                      textDecorationStyle: 'initial',
                                      textDecorationColor: 'initial',
                                      color: 'rgb(89, 89, 89)',
                                    }}
                                  >
                                    Upload or transmit (or attempt to upload or
                                    to transmit) any material that acts as a
                                    passive or active information collection or
                                    transmission mechanism, including without
                                    limitation, clear graphics interchange
                                    formats (“gifs”), 1×1 pixels, web bugs,
                                    cookies, or other similar devices (sometimes
                                    referred to as “spyware” or “passive
                                    collection mechanisms” or “pcms”).
                                  </span>
                                </span>
                              </span>
                            </span>
                          </span>
                        </li>
                        <li
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <span style={{ fontSize: 15 }}>
                            <span
                              style={{
                                lineHeight: '16.8667px',
                                color: 'rgb(89, 89, 89)',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'sans-serif',
                                  fontStyle: 'normal',
                                  fontVariantLigatures: 'normal',
                                  fontVariantCaps: 'normal',
                                  fontWeight: 400,
                                  letterSpacing: 'normal',
                                  orphans: 2,
                                  textAlign: 'justify',
                                  textIndent: '-29.4px',
                                  textTransform: 'none',
                                  whiteSpace: 'normal',
                                  widows: 2,
                                  wordSpacing: 0,
                                  WebkitTextStrokeWidth: 0,
                                  backgroundColor: 'rgb(255, 255, 255)',
                                  textDecorationStyle: 'initial',
                                  textDecorationColor: 'initial',
                                  color: 'rgb(89, 89, 89)',
                                }}
                              >
                                <span
                                  style={{
                                    lineHeight: '16.8667px',
                                    color: 'rgb(89, 89, 89)',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: 'sans-serif',
                                      fontStyle: 'normal',
                                      fontVariantLigatures: 'normal',
                                      fontVariantCaps: 'normal',
                                      fontWeight: 400,
                                      letterSpacing: 'normal',
                                      orphans: 2,
                                      textAlign: 'justify',
                                      textIndent: '-29.4px',
                                      textTransform: 'none',
                                      whiteSpace: 'normal',
                                      widows: 2,
                                      wordSpacing: 0,
                                      WebkitTextStrokeWidth: 0,
                                      backgroundColor: 'rgb(255, 255, 255)',
                                      textDecorationStyle: 'initial',
                                      textDecorationColor: 'initial',
                                      color: 'rgb(89, 89, 89)',
                                    }}
                                  >
                                    Interfere with, disrupt, or create an undue
                                    burden on the Site or the networks or
                                    services connected to the Site.
                                  </span>
                                </span>
                              </span>
                            </span>
                          </span>
                        </li>
                        <li
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <span style={{ fontSize: 15 }}>
                            <span
                              style={{
                                lineHeight: '16.8667px',
                                color: 'rgb(89, 89, 89)',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'sans-serif',
                                  fontStyle: 'normal',
                                  fontVariantLigatures: 'normal',
                                  fontVariantCaps: 'normal',
                                  fontWeight: 400,
                                  letterSpacing: 'normal',
                                  orphans: 2,
                                  textAlign: 'justify',
                                  textIndent: '-29.4px',
                                  textTransform: 'none',
                                  whiteSpace: 'normal',
                                  widows: 2,
                                  wordSpacing: 0,
                                  WebkitTextStrokeWidth: 0,
                                  backgroundColor: 'rgb(255, 255, 255)',
                                  textDecorationStyle: 'initial',
                                  textDecorationColor: 'initial',
                                  color: 'rgb(89, 89, 89)',
                                }}
                              >
                                <span
                                  style={{
                                    lineHeight: '16.8667px',
                                    color: 'rgb(89, 89, 89)',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: 'sans-serif',
                                      fontStyle: 'normal',
                                      fontVariantLigatures: 'normal',
                                      fontVariantCaps: 'normal',
                                      fontWeight: 400,
                                      letterSpacing: 'normal',
                                      orphans: 2,
                                      textAlign: 'justify',
                                      textIndent: '-29.4px',
                                      textTransform: 'none',
                                      whiteSpace: 'normal',
                                      widows: 2,
                                      wordSpacing: 0,
                                      WebkitTextStrokeWidth: 0,
                                      backgroundColor: 'rgb(255, 255, 255)',
                                      textDecorationStyle: 'initial',
                                      textDecorationColor: 'initial',
                                      color: 'rgb(89, 89, 89)',
                                    }}
                                  >
                                    Harass, annoy, intimidate, or threaten any
                                    of our employees or agents engaged in
                                    providing any portion of the Site to you.
                                  </span>
                                </span>
                              </span>
                            </span>
                          </span>
                        </li>
                        <li
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <span style={{ fontSize: 15 }}>
                            <span
                              style={{
                                lineHeight: '16.8667px',
                                color: 'rgb(89, 89, 89)',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'sans-serif',
                                  fontStyle: 'normal',
                                  fontVariantLigatures: 'normal',
                                  fontVariantCaps: 'normal',
                                  fontWeight: 400,
                                  letterSpacing: 'normal',
                                  orphans: 2,
                                  textAlign: 'justify',
                                  textIndent: '-29.4px',
                                  textTransform: 'none',
                                  whiteSpace: 'normal',
                                  widows: 2,
                                  wordSpacing: 0,
                                  WebkitTextStrokeWidth: 0,
                                  backgroundColor: 'rgb(255, 255, 255)',
                                  textDecorationStyle: 'initial',
                                  textDecorationColor: 'initial',
                                  color: 'rgb(89, 89, 89)',
                                }}
                              >
                                <span
                                  style={{
                                    lineHeight: '16.8667px',
                                    color: 'rgb(89, 89, 89)',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: 'sans-serif',
                                      fontStyle: 'normal',
                                      fontVariantLigatures: 'normal',
                                      fontVariantCaps: 'normal',
                                      fontWeight: 400,
                                      letterSpacing: 'normal',
                                      orphans: 2,
                                      textAlign: 'justify',
                                      textIndent: '-29.4px',
                                      textTransform: 'none',
                                      whiteSpace: 'normal',
                                      widows: 2,
                                      wordSpacing: 0,
                                      WebkitTextStrokeWidth: 0,
                                      backgroundColor: 'rgb(255, 255, 255)',
                                      textDecorationStyle: 'initial',
                                      textDecorationColor: 'initial',
                                      color: 'rgb(89, 89, 89)',
                                    }}
                                  >
                                    Attempt to bypass any measures of the Site
                                    designed to prevent or restrict access to
                                    the Site, or any portion of the Site.
                                  </span>
                                </span>
                              </span>
                            </span>
                          </span>
                        </li>
                        <li
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <span style={{ fontSize: 15 }}>
                            <span
                              style={{
                                lineHeight: '16.8667px',
                                color: 'rgb(89, 89, 89)',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'sans-serif',
                                  fontStyle: 'normal',
                                  fontVariantLigatures: 'normal',
                                  fontVariantCaps: 'normal',
                                  fontWeight: 400,
                                  letterSpacing: 'normal',
                                  orphans: 2,
                                  textAlign: 'justify',
                                  textIndent: '-29.4px',
                                  textTransform: 'none',
                                  whiteSpace: 'normal',
                                  widows: 2,
                                  wordSpacing: 0,
                                  WebkitTextStrokeWidth: 0,
                                  backgroundColor: 'rgb(255, 255, 255)',
                                  textDecorationStyle: 'initial',
                                  textDecorationColor: 'initial',
                                  color: 'rgb(89, 89, 89)',
                                }}
                              >
                                <span
                                  style={{
                                    lineHeight: '16.8667px',
                                    color: 'rgb(89, 89, 89)',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: 'sans-serif',
                                      fontStyle: 'normal',
                                      fontVariantLigatures: 'normal',
                                      fontVariantCaps: 'normal',
                                      fontWeight: 400,
                                      letterSpacing: 'normal',
                                      orphans: 2,
                                      textAlign: 'justify',
                                      textIndent: '-29.4px',
                                      textTransform: 'none',
                                      whiteSpace: 'normal',
                                      widows: 2,
                                      wordSpacing: 0,
                                      WebkitTextStrokeWidth: 0,
                                      backgroundColor: 'rgb(255, 255, 255)',
                                      textDecorationStyle: 'initial',
                                      textDecorationColor: 'initial',
                                      color: 'rgb(89, 89, 89)',
                                    }}
                                  >
                                    Copy or adapt the Site’s software, including
                                    but not limited to Flash, PHP, HTML,
                                    JavaScript, or other code.
                                  </span>
                                </span>
                              </span>
                            </span>
                          </span>
                        </li>
                        <li
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <span style={{ fontSize: 15 }}>
                            <span
                              style={{
                                lineHeight: '16.8667px',
                                color: 'rgb(89, 89, 89)',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'sans-serif',
                                  fontStyle: 'normal',
                                  fontVariantLigatures: 'normal',
                                  fontVariantCaps: 'normal',
                                  fontWeight: 400,
                                  letterSpacing: 'normal',
                                  orphans: 2,
                                  textAlign: 'justify',
                                  textIndent: '-29.4px',
                                  textTransform: 'none',
                                  whiteSpace: 'normal',
                                  widows: 2,
                                  wordSpacing: 0,
                                  WebkitTextStrokeWidth: 0,
                                  backgroundColor: 'rgb(255, 255, 255)',
                                  textDecorationStyle: 'initial',
                                  textDecorationColor: 'initial',
                                  color: 'rgb(89, 89, 89)',
                                }}
                              >
                                <span
                                  style={{
                                    lineHeight: '16.8667px',
                                    color: 'rgb(89, 89, 89)',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: 'sans-serif',
                                      fontStyle: 'normal',
                                      fontVariantLigatures: 'normal',
                                      fontVariantCaps: 'normal',
                                      fontWeight: 400,
                                      letterSpacing: 'normal',
                                      orphans: 2,
                                      textAlign: 'justify',
                                      textIndent: '-29.4px',
                                      textTransform: 'none',
                                      whiteSpace: 'normal',
                                      widows: 2,
                                      wordSpacing: 0,
                                      WebkitTextStrokeWidth: 0,
                                      backgroundColor: 'rgb(255, 255, 255)',
                                      textDecorationStyle: 'initial',
                                      textDecorationColor: 'initial',
                                      color: 'rgb(89, 89, 89)',
                                    }}
                                  >
                                    Except as permitted by applicable law,
                                    decipher, decompile, disassemble, or reverse
                                    engineer any of the software comprising or
                                    in any way making up a part of the Site.
                                  </span>
                                </span>
                              </span>
                            </span>
                          </span>
                        </li>
                        <li
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <span style={{ fontSize: 15 }}>
                            <span
                              style={{
                                lineHeight: '16.8667px',
                                color: 'rgb(89, 89, 89)',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'sans-serif',
                                  fontStyle: 'normal',
                                  fontVariantLigatures: 'normal',
                                  fontVariantCaps: 'normal',
                                  fontWeight: 400,
                                  letterSpacing: 'normal',
                                  orphans: 2,
                                  textAlign: 'justify',
                                  textIndent: '-29.4px',
                                  textTransform: 'none',
                                  whiteSpace: 'normal',
                                  widows: 2,
                                  wordSpacing: 0,
                                  WebkitTextStrokeWidth: 0,
                                  backgroundColor: 'rgb(255, 255, 255)',
                                  textDecorationStyle: 'initial',
                                  textDecorationColor: 'initial',
                                  color: 'rgb(89, 89, 89)',
                                }}
                              >
                                <span
                                  style={{
                                    lineHeight: '16.8667px',
                                    color: 'rgb(89, 89, 89)',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: 'sans-serif',
                                      fontStyle: 'normal',
                                      fontVariantLigatures: 'normal',
                                      fontVariantCaps: 'normal',
                                      fontWeight: 400,
                                      letterSpacing: 'normal',
                                      orphans: 2,
                                      textAlign: 'justify',
                                      textIndent: '-29.4px',
                                      textTransform: 'none',
                                      whiteSpace: 'normal',
                                      widows: 2,
                                      wordSpacing: 0,
                                      WebkitTextStrokeWidth: 0,
                                      backgroundColor: 'rgb(255, 255, 255)',
                                      textDecorationStyle: 'initial',
                                      textDecorationColor: 'initial',
                                      color: 'rgb(89, 89, 89)',
                                    }}
                                  >
                                    Except as may be the result of standard
                                    search engine or Internet browser usage,
                                    use, launch, develop, or distribute any
                                    automated system, including without
                                    limitation, any spider, robot, cheat
                                    utility, scraper, or offline reader that
                                    accesses the Site, or using or launching any
                                    unauthorized script or other software.
                                  </span>
                                </span>
                              </span>
                            </span>
                          </span>
                        </li>
                        <li
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <span style={{ fontSize: 15 }}>
                            <span
                              style={{
                                lineHeight: '16.8667px',
                                color: 'rgb(89, 89, 89)',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'sans-serif',
                                  fontStyle: 'normal',
                                  fontVariantLigatures: 'normal',
                                  fontVariantCaps: 'normal',
                                  fontWeight: 400,
                                  letterSpacing: 'normal',
                                  orphans: 2,
                                  textAlign: 'justify',
                                  textIndent: '-29.4px',
                                  textTransform: 'none',
                                  whiteSpace: 'normal',
                                  widows: 2,
                                  wordSpacing: 0,
                                  WebkitTextStrokeWidth: 0,
                                  backgroundColor: 'rgb(255, 255, 255)',
                                  textDecorationStyle: 'initial',
                                  textDecorationColor: 'initial',
                                  color: 'rgb(89, 89, 89)',
                                }}
                              >
                                <span
                                  style={{
                                    lineHeight: '16.8667px',
                                    color: 'rgb(89, 89, 89)',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: 'sans-serif',
                                      fontStyle: 'normal',
                                      fontVariantLigatures: 'normal',
                                      fontVariantCaps: 'normal',
                                      fontWeight: 400,
                                      letterSpacing: 'normal',
                                      orphans: 2,
                                      textAlign: 'justify',
                                      textIndent: '-29.4px',
                                      textTransform: 'none',
                                      whiteSpace: 'normal',
                                      widows: 2,
                                      wordSpacing: 0,
                                      WebkitTextStrokeWidth: 0,
                                      backgroundColor: 'rgb(255, 255, 255)',
                                      textDecorationStyle: 'initial',
                                      textDecorationColor: 'initial',
                                      color: 'rgb(89, 89, 89)',
                                    }}
                                  >
                                    Use a buying agent or purchasing agent to
                                    make purchases on the Site.
                                  </span>
                                </span>
                              </span>
                            </span>
                          </span>
                        </li>
                        <li
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <span style={{ fontSize: 15 }}>
                            <span
                              style={{
                                lineHeight: '16.8667px',
                                color: 'rgb(89, 89, 89)',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'sans-serif',
                                  fontStyle: 'normal',
                                  fontVariantLigatures: 'normal',
                                  fontVariantCaps: 'normal',
                                  fontWeight: 400,
                                  letterSpacing: 'normal',
                                  orphans: 2,
                                  textAlign: 'justify',
                                  textIndent: '-29.4px',
                                  textTransform: 'none',
                                  whiteSpace: 'normal',
                                  widows: 2,
                                  wordSpacing: 0,
                                  WebkitTextStrokeWidth: 0,
                                  backgroundColor: 'rgb(255, 255, 255)',
                                  textDecorationStyle: 'initial',
                                  textDecorationColor: 'initial',
                                  color: 'rgb(89, 89, 89)',
                                }}
                              >
                                <span
                                  style={{
                                    lineHeight: '16.8667px',
                                    color: 'rgb(89, 89, 89)',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: 'sans-serif',
                                      fontStyle: 'normal',
                                      fontVariantLigatures: 'normal',
                                      fontVariantCaps: 'normal',
                                      fontWeight: 400,
                                      letterSpacing: 'normal',
                                      orphans: 2,
                                      textAlign: 'justify',
                                      textIndent: '-29.4px',
                                      textTransform: 'none',
                                      whiteSpace: 'normal',
                                      widows: 2,
                                      wordSpacing: 0,
                                      WebkitTextStrokeWidth: 0,
                                      backgroundColor: 'rgb(255, 255, 255)',
                                      textDecorationStyle: 'initial',
                                      textDecorationColor: 'initial',
                                      color: 'rgb(89, 89, 89)',
                                    }}
                                  >
                                    Make any unauthorized use of the Site,
                                    including collecting usernames and/or email
                                    addresses of users by electronic or other
                                    means for the purpose of sending unsolicited
                                    email, or creating user accounts by
                                    automated means or under false pretenses.
                                  </span>
                                </span>
                              </span>
                            </span>
                          </span>
                        </li>
                        <li
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <span style={{ fontSize: 15 }}>
                            <span
                              style={{
                                lineHeight: '16.8667px',
                                color: 'rgb(89, 89, 89)',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'sans-serif',
                                  fontStyle: 'normal',
                                  fontVariantLigatures: 'normal',
                                  fontVariantCaps: 'normal',
                                  fontWeight: 400,
                                  letterSpacing: 'normal',
                                  orphans: 2,
                                  textAlign: 'justify',
                                  textIndent: '-29.4px',
                                  textTransform: 'none',
                                  whiteSpace: 'normal',
                                  widows: 2,
                                  wordSpacing: 0,
                                  WebkitTextStrokeWidth: 0,
                                  backgroundColor: 'rgb(255, 255, 255)',
                                  textDecorationStyle: 'initial',
                                  textDecorationColor: 'initial',
                                  color: 'rgb(89, 89, 89)',
                                }}
                              >
                                <span
                                  style={{
                                    lineHeight: '16.8667px',
                                    color: 'rgb(89, 89, 89)',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: 'sans-serif',
                                      fontStyle: 'normal',
                                      fontVariantLigatures: 'normal',
                                      fontVariantCaps: 'normal',
                                      fontWeight: 400,
                                      letterSpacing: 'normal',
                                      orphans: 2,
                                      textAlign: 'justify',
                                      textIndent: '-29.4px',
                                      textTransform: 'none',
                                      whiteSpace: 'normal',
                                      widows: 2,
                                      wordSpacing: 0,
                                      WebkitTextStrokeWidth: 0,
                                      backgroundColor: 'rgb(255, 255, 255)',
                                      textDecorationStyle: 'initial',
                                      textDecorationColor: 'initial',
                                      color: 'rgb(89, 89, 89)',
                                    }}
                                  >
                                    Use the Site as part of any effort to
                                    compete with us or otherwise use the Site
                                    and/or the Content for any
                                    revenue-generating endeavor or commercial
                                    enterprise.
                                    <span
                                      style={{
                                        fontSize: '11pt',
                                        lineHeight: '16.8667px',
                                        color: 'rgb(89, 89, 89)',
                                      }}
                                    >
                                      <span className="forloop-component" />
                                    </span>
                                  </span>
                                </span>
                              </span>
                            </span>
                          </span>
                        </li>
                        <li
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <span
                            style={{
                              fontSize: '11pt',
                              lineHeight: '16.8667px',
                              color: 'rgb(89, 89, 89)',
                            }}
                          >
                            <span className="question">
                              Use the Site to advertise or offer to sell goods
                              and services.
                            </span>
                          </span>
                          <span
                            style={{
                              fontSize: '11pt',
                              lineHeight: '16.8667px',
                              color: 'rgb(89, 89, 89)',
                            }}
                          >
                            <span className="forloop-component" />
                          </span>
                        </li>
                        <li
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <span
                            style={{
                              fontSize: '11pt',
                              lineHeight: '16.8667px',
                              color: 'rgb(89, 89, 89)',
                            }}
                          >
                            <span className="question">
                              Sell or otherwise transfer your profile.
                            </span>
                          </span>
                          <span
                            style={{
                              fontSize: '11pt',
                              lineHeight: '16.8667px',
                              color: 'rgb(89, 89, 89)',
                            }}
                          >
                            <span className="forloop-component" />
                          </span>
                        </li>
                        <li
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5', textAlign: 'left' }}
                        >
                          <span
                            style={{
                              fontSize: '11pt',
                              lineHeight: '16.8667px',
                              color: 'rgb(89, 89, 89)',
                            }}
                          >
                            <span className="question">
                              Spamming or posting unsolicited commerical content
                            </span>
                          </span>
                          <span
                            style={{
                              fontSize: '11pt',
                              lineHeight: '16.8667px',
                              color: 'rgb(89, 89, 89)',
                            }}
                          >
                            <span className="forloop-component" />
                          </span>
                        </li>
                      </ul>
                    </div>
                    <div className="MsoNormal" style={{ lineHeight: '1.5' }}>
                      <br />
                    </div>
                  </div>
                  <div className="MsoNormal" style={{ lineHeight: '1.5' }}>
                    <br />
                  </div>
                  <div className="MsoNormal" style={{ lineHeight: '17.25px' }}>
                    <div className="MsoNormal" style={{ lineHeight: 1 }}>
                      <span
                        className="block-container if"
                        data-type="if"
                        style={{ textAlign: 'left' }}
                      >
                        <span data-type="conditional-block">
                          <span data-type="body">
                            <div
                              className="MsoNormal"
                              data-custom-class="heading_1"
                              id="ugc"
                              style={{ lineHeight: '1.5' }}
                            >
                              <strong>
                                <span
                                  style={{
                                    lineHeight: '24.5333px',
                                    fontSize: 19,
                                  }}
                                >
                                  <strong>
                                    <span
                                      style={{
                                        lineHeight: '24.5333px',
                                        fontSize: 19,
                                      }}
                                    >
                                      <strong>
                                        <span
                                          style={{
                                            lineHeight: '115%',
                                            fontFamily: 'Arial',
                                            fontSize: 19,
                                          }}
                                        >
                                          <strong>
                                            <span
                                              style={{
                                                lineHeight: '115%',
                                                fontFamily: 'Arial',
                                                fontSize: 19,
                                              }}
                                            >
                                              9.
                                            </span>
                                          </strong>
                                        </span>
                                      </strong>
                                    </span>
                                    &nbsp;
                                  </strong>
                                  USER GENERATED CONTRIBUTIONS
                                </span>
                              </strong>
                            </div>
                          </span>
                        </span>
                      </span>
                    </div>
                    <div className="MsoNormal" style={{ lineHeight: 1 }}>
                      <br />
                    </div>
                    <div className="MsoNormal" style={{ lineHeight: 1 }}>
                      <span
                        className="block-container if"
                        data-type="if"
                        style={{ textAlign: 'left' }}
                      >
                        <span data-type="conditional-block">
                          <span data-type="body">
                            <div
                              className="MsoNormal"
                              data-custom-class="body_text"
                              style={{ lineHeight: '1.5' }}
                            >
                              <span
                                style={{
                                  fontSize: '11pt',
                                  lineHeight: '16.8667px',
                                  color: 'rgb(89, 89, 89)',
                                }}
                              >
                                <span
                                  className="block-container if"
                                  data-type="if"
                                  id="24327c5d-a34f-f7e7-88f1-65a2f788484f"
                                  style={{ textAlign: 'left' }}
                                >
                                  <span data-type="conditional-block">
                                    <span
                                      className="block-component"
                                      data-record-question-key="user_post_content_option"
                                      data-type="statement"
                                    />
                                  </span>
                                </span>
                                The Site may invite you to chat, contribute to,
                                or participate in blogs, message boards, online
                                forums, and other functionality, and may provide
                                you with the opportunity to create, submit,
                                post, display, transmit, perform, publish,
                                distribute, or broadcast content and materials
                                to us or on the Site, including but not limited
                                to text, writings, video, audio, photographs,
                                graphics, comments, suggestions, or personal
                                information or other material (collectively,
                                "Contributions"). Contributions may be viewable
                                by other users of the Site and the Marketplace
                                Offerings and through third-party websites. As
                                such, any Contributions you transmit may be
                                treated as non-confidential and non-proprietary.
                                When you create or make available any
                                Contributions, you thereby represent and warrant
                                that:
                                <span className="else-block" />
                              </span>
                            </div>
                          </span>
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
                <ul>
                  <li className="MsoNormal" style={{ lineHeight: '1.5' }}>
                    <span style={{ color: 'rgb(89, 89, 89)' }}>
                      <span style={{ fontSize: 14 }}>
                        <span data-custom-class="body_text">
                          The creation, distribution, transmission, public
                          display, or performance, and the accessing,
                          downloading, or copying of your Contributions do not
                          and will not infringe the proprietary rights,
                          including but not limited to the copyright, patent,
                          trademark, trade secret, or moral rights of any third
                          party.
                        </span>
                      </span>
                    </span>
                  </li>
                  <li className="MsoNormal" style={{ lineHeight: '1.5' }}>
                    <span style={{ color: 'rgb(89, 89, 89)' }}>
                      <span style={{ fontSize: 14 }}>
                        <span data-custom-class="body_text">
                          You are the creator and owner of or have the necessary
                          licenses, rights, consents, releases, and permissions
                          to use and to authorize us, the Site, and other users
                          of the Site to use your Contributions in any manner
                          contemplated by the Site and these Terms of Use.
                        </span>
                      </span>
                    </span>
                  </li>
                  <li className="MsoNormal" style={{ lineHeight: '1.5' }}>
                    <span style={{ color: 'rgb(89, 89, 89)' }}>
                      <span style={{ fontSize: 14 }}>
                        <span data-custom-class="body_text">
                          You have the written consent, release, and/or
                          permission of each and every identifiable individual
                          person in your Contributions to use the name or
                          likeness of each and every such identifiable
                          individual person to enable inclusion and use of your
                          Contributions in any manner contemplated by the Site
                          and these Terms of Use.
                        </span>
                      </span>
                    </span>
                  </li>
                  <li className="MsoNormal" style={{ lineHeight: '1.5' }}>
                    <span style={{ color: 'rgb(89, 89, 89)' }}>
                      <span style={{ fontSize: 14 }}>
                        <span data-custom-class="body_text">
                          Your Contributions are not false, inaccurate, or
                          misleading.
                        </span>
                      </span>
                    </span>
                  </li>
                  <li className="MsoNormal" style={{ lineHeight: '1.5' }}>
                    <span style={{ color: 'rgb(89, 89, 89)' }}>
                      <span style={{ fontSize: 14 }}>
                        <span data-custom-class="body_text">
                          Your Contributions are not unsolicited or unauthorized
                          advertising, promotional materials, pyramid schemes,
                          chain letters, spam, mass mailings, or other forms of
                          solicitation.
                        </span>
                      </span>
                    </span>
                  </li>
                  <li className="MsoNormal" style={{ lineHeight: '1.5' }}>
                    <span style={{ color: 'rgb(89, 89, 89)' }}>
                      <span style={{ fontSize: 14 }}>
                        <span data-custom-class="body_text">
                          Your Contributions are not obscene, lewd, lascivious,
                          filthy, violent, harassing, libelous, slanderous, or
                          otherwise objectionable (as determined by us).
                        </span>
                      </span>
                    </span>
                  </li>
                  <li className="MsoNormal" style={{ lineHeight: '1.5' }}>
                    <span style={{ color: 'rgb(89, 89, 89)' }}>
                      <span style={{ fontSize: 14 }}>
                        <span data-custom-class="body_text">
                          Your Contributions do not ridicule, mock, disparage,
                          intimidate, or abuse anyone.
                        </span>
                      </span>
                    </span>
                  </li>
                  <li className="MsoNormal" style={{ lineHeight: '1.5' }}>
                    <span style={{ color: 'rgb(89, 89, 89)' }}>
                      <span style={{ fontSize: 14 }}>
                        <span data-custom-class="body_text">
                          Your Contributions are not used to harass or threaten
                          (in the legal sense of those terms) any other person
                          and to promote violence against a specific person or
                          class of people.
                        </span>
                      </span>
                    </span>
                  </li>
                  <li className="MsoNormal" style={{ lineHeight: '1.5' }}>
                    <span style={{ color: 'rgb(89, 89, 89)' }}>
                      <span style={{ fontSize: 14 }}>
                        <span data-custom-class="body_text">
                          Your Contributions do not violate any applicable law,
                          regulation, or rule.
                        </span>
                      </span>
                    </span>
                  </li>
                  <li className="MsoNormal" style={{ lineHeight: '1.5' }}>
                    <span style={{ color: 'rgb(89, 89, 89)' }}>
                      <span style={{ fontSize: 14 }}>
                        <span data-custom-class="body_text">
                          Your Contributions do not violate the privacy or
                          publicity rights of any third party.
                        </span>
                      </span>
                    </span>
                  </li>
                  <li className="MsoNormal" style={{ lineHeight: '1.5' }}>
                    <span style={{ color: 'rgb(89, 89, 89)' }}>
                      <span style={{ fontSize: 14 }}>
                        <span data-custom-class="body_text">
                          Your Contributions do not violate any applicable law
                          concerning child pornography, or otherwise intended to
                          protect the health or well-being of minors;
                        </span>
                      </span>
                    </span>
                  </li>
                  <li className="MsoNormal" style={{ lineHeight: '1.5' }}>
                    <span style={{ color: 'rgb(89, 89, 89)' }}>
                      <span style={{ fontSize: 14 }}>
                        <span data-custom-class="body_text">
                          Your Contributions do not include any offensive
                          comments that are connected to race, national origin,
                          gender, sexual preference, or physical handicap.
                        </span>
                      </span>
                    </span>
                  </li>
                  <li className="MsoNormal" style={{ lineHeight: '1.5' }}>
                    <span style={{ color: 'rgb(89, 89, 89)' }}>
                      <span style={{ fontSize: 14 }}>
                        <span data-custom-class="body_text">
                          Your Contributions do not otherwise violate, or link
                          to material that violates, any provision of these
                          Terms of Use, or any applicable law or regulation.
                        </span>
                      </span>
                    </span>
                  </li>
                </ul>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: '1.5' }}
                >
                  <span
                    className="block-container if"
                    data-type="if"
                    style={{ textAlign: 'left' }}
                  >
                    <span data-type="conditional-block">
                      <span data-type="body">
                        <div
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5' }}
                        >
                          <span
                            style={{
                              fontSize: '11pt',
                              lineHeight: '16.8667px',
                              color: 'rgb(89, 89, 89)',
                            }}
                          >
                            Any use of the Site or the Marketplace Offerings in
                            violation of the foregoing violates these Terms of
                            Use and may result in, among other things,
                            termination or suspension of your rights to use the
                            Site and the Marketplace Offerings.
                          </span>
                        </div>
                      </span>
                    </span>
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: '1.5' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: '1.5' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: 1 }}
                >
                  <span
                    className="block-container if"
                    data-type="if"
                    style={{ textAlign: 'left' }}
                  >
                    <span data-type="conditional-block">
                      <span data-type="body">
                        <div
                          className="MsoNormal"
                          data-custom-class="heading_1"
                          id="license"
                          style={{ lineHeight: '1.5' }}
                        >
                          <strong>
                            <span
                              style={{ lineHeight: '24.5333px', fontSize: 19 }}
                            >
                              <strong>
                                <span
                                  style={{
                                    lineHeight: '24.5333px',
                                    fontSize: 19,
                                  }}
                                >
                                  <strong>
                                    <span
                                      style={{
                                        lineHeight: '115%',
                                        fontFamily: 'Arial',
                                        fontSize: 19,
                                      }}
                                    >
                                      <strong>
                                        <span
                                          style={{
                                            lineHeight: '115%',
                                            fontFamily: 'Arial',
                                            fontSize: 19,
                                          }}
                                        >
                                          10.
                                        </span>
                                      </strong>
                                    </span>
                                  </strong>
                                </span>
                                &nbsp;
                              </strong>
                              CONTRIBUTION LICENSE
                            </span>
                          </strong>
                        </div>
                      </span>
                    </span>
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: 1 }}
                >
                  <br />
                </div>
                <div className="MsoNormal" style={{ lineHeight: 1 }}>
                  <span
                    className="block-container if"
                    data-type="if"
                    id="a088ddfb-d8c1-9e58-6f21-958c3f4f0709"
                    style={{ textAlign: 'left' }}
                  >
                    <span data-type="conditional-block">
                      <span
                        className="block-component"
                        data-record-question-key="user_post_content_option"
                        data-type="statement"
                      />
                    </span>
                  </span>
                  <span
                    className="block-container if"
                    data-type="if"
                    style={{ textAlign: 'left' }}
                  >
                    <span data-type="conditional-block">
                      <span data-type="body">
                        <div
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5' }}
                        >
                          <span
                            style={{
                              fontSize: '11pt',
                              lineHeight: '16.8667px',
                              color: 'rgb(89, 89, 89)',
                            }}
                          >
                            By posting your Contributions to any part of the
                            Site
                            <span
                              className="block-container if"
                              data-type="if"
                              id="19652acc-9a2a-5ffe-6189-9474402fa6cc"
                            >
                              <span data-type="conditional-block">
                                <span
                                  className="block-component"
                                  data-record-question-key="socialnetwork_link_option"
                                  data-type="statement"
                                />
                                <span data-type="body">
                                  &nbsp;or making Contributions accessible to
                                  the Site by linking your account from the Site
                                  to any of your social networking accounts
                                </span>
                              </span>
                              <span
                                className="statement-end-if-in-editor"
                                data-type="close"
                              />
                            </span>
                            , you automatically grant, and you represent and
                            warrant that you have the right to grant, to us an
                            unrestricted, unlimited, irrevocable, perpetual,
                            non-exclusive, transferable, royalty-free,
                            fully-paid, worldwide right, and license to host,
                            use, copy, reproduce, disclose, sell, resell,
                            publish, broadcast, retitle, archive, store, cache,
                            publicly perform, publicly display, reformat,
                            translate, transmit, excerpt (in whole or in part),
                            and distribute such Contributions (including,
                            without limitation, your image and voice) for any
                            purpose, commercial, advertising, or otherwise, and
                            to prepare derivative works of, or incorporate into
                            other works, such Contributions, and grant and
                            authorize sublicenses of the foregoing. The use and
                            distribution may occur in any media formats and
                            through any media channels.
                          </span>
                        </div>
                      </span>
                    </span>
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: 1 }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: 1 }}
                >
                  <span
                    className="block-container if"
                    data-type="if"
                    style={{ textAlign: 'left' }}
                  >
                    <span data-type="conditional-block">
                      <span data-type="body">
                        <div
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5' }}
                        >
                          <span
                            style={{
                              fontSize: '11pt',
                              lineHeight: '16.8667px',
                              color: 'rgb(89, 89, 89)',
                            }}
                          >
                            This license will apply to any form, media, or
                            technology now known or hereafter developed, and
                            includes our use of your name, company name, and
                            franchise name, as applicable, and any of the
                            trademarks, service marks, trade names, logos, and
                            personal and commercial images you provide. You
                            waive all moral rights in your Contributions, and
                            you warrant that moral rights have not otherwise
                            been asserted in your Contributions.
                          </span>
                        </div>
                      </span>
                    </span>
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: 1 }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: 1 }}
                >
                  <span
                    className="block-container if"
                    data-type="if"
                    style={{ textAlign: 'left' }}
                  >
                    <span data-type="conditional-block">
                      <span data-type="body">
                        <div
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5' }}
                        >
                          <span
                            style={{
                              fontSize: '11pt',
                              lineHeight: '16.8667px',
                              color: 'rgb(89, 89, 89)',
                            }}
                          >
                            We do not assert any ownership over your
                            Contributions. You retain full ownership of all of
                            your Contributions and any intellectual property
                            rights or other proprietary rights associated with
                            your Contributions. We are not liable for any
                            statements or representations in your Contributions
                            provided by you in any area on the Site. You are
                            solely responsible for your Contributions to the
                            Site and you expressly agree to exonerate us from
                            any and all responsibility and to refrain from any
                            legal action against us regarding your
                            Contributions.
                          </span>
                        </div>
                      </span>
                    </span>
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: 1 }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: 1 }}
                >
                  <span
                    className="block-container if"
                    data-type="if"
                    style={{ textAlign: 'left' }}
                  >
                    <span data-type="conditional-block">
                      <span data-type="body">
                        <div
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5' }}
                        >
                          <span
                            style={{
                              fontSize: '11pt',
                              lineHeight: '16.8667px',
                              color: 'rgb(89, 89, 89)',
                            }}
                          >
                            We have the right, in our sole and absolute
                            discretion, (1) to edit, redact, or otherwise change
                            any Contributions; (2) to re-categorize any
                            Contributions to place them in more appropriate
                            locations on the Site; and (3) to pre-screen or
                            delete any Contributions at any time and for any
                            reason, without notice. We have no obligation to
                            monitor your Contributions.
                          </span>
                        </div>
                      </span>
                    </span>
                  </span>
                </div>
              </div>
              <div
                align="center"
                style={{ textAlign: 'left', lineHeight: '1.5' }}
              >
                <br />
              </div>
              <div
                align="center"
                style={{ textAlign: 'left', lineHeight: '1.5' }}
              >
                <br />
              </div>
              <div align="center" style={{ textAlign: 'left' }}>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: '1.5' }}
                >
                  <span
                    className="block-container if"
                    data-type="if"
                    style={{ textAlign: 'left' }}
                  >
                    <span data-type="conditional-block">
                      <span data-type="body">
                        <span
                          style={{
                            fontSize: '11pt',
                            lineHeight: '16.8667px',
                            color: 'rgb(89, 89, 89)',
                          }}
                        >
                          <span className="else-block" />
                        </span>
                      </span>
                    </span>
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ textAlign: 'justify', lineHeight: '1.5' }}
                >
                  <span
                    className="block-container if"
                    data-type="if"
                    style={{ textAlign: 'left' }}
                  >
                    <span data-type="conditional-block">
                      <span
                        className="block-component"
                        data-record-question-key="review_option"
                        data-type="statement"
                      />
                    </span>
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: '1.5' }}
                >
                  <span
                    className="block-container if"
                    data-type="if"
                    style={{ textAlign: 'left' }}
                  >
                    <span data-type="conditional-block">
                      <span
                        className="block-component"
                        data-record-question-key="mobile_app_option"
                        data-type="statement"
                      />
                    </span>
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_1"
                  id="mobile"
                  style={{ lineHeight: '1.5' }}
                >
                  <strong>
                    <strong>
                      <span style={{ lineHeight: '24.5333px', fontSize: 19 }}>
                        <strong>
                          <span
                            style={{
                              lineHeight: '115%',
                              fontFamily: 'Arial',
                              fontSize: 19,
                            }}
                          >
                            <strong>
                              <span
                                style={{
                                  lineHeight: '115%',
                                  fontFamily: 'Arial',
                                  fontSize: 19,
                                }}
                              >
                                11.
                              </span>
                            </strong>
                          </span>
                        </strong>
                      </span>
                      &nbsp;
                    </strong>
                    MOBILE APPLICATION LICENSE
                  </strong>
                </div>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: 1 }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_2"
                  style={{ textAlign: 'justify', lineHeight: '1.5' }}
                >
                  <strong>Use License</strong>
                </div>
                <div
                  className="MsoNormal"
                  style={{ textAlign: 'justify', lineHeight: 1 }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5' }}
                >
                  <span
                    style={{
                      fontSize: '11pt',
                      lineHeight: '16.8667px',
                      color: 'rgb(89, 89, 89)',
                    }}
                  >
                    If you access the Marketplace Offerings via a mobile
                    application, then we grant you a revocable, non-exclusive,
                    non-transferable, limited right to install and use the
                    mobile application on wireless electronic devices owned or
                    controlled by you, and to access and use the mobile
                    application on such devices strictly in accordance with the
                    terms and conditions of this mobile application license
                    contained in these Terms of Use. You shall not: (1) except
                    as permitted by applicable law, decompile, reverse engineer,
                    disassemble, attempt to derive the source code of, or
                    decrypt the application; (2) make any modification,
                    adaptation, improvement, enhancement, translation, or
                    derivative work from the application; (3) violate any
                    applicable laws, rules, or regulations in connection with
                    your access or use of the application; (4) remove, alter, or
                    obscure any proprietary notice (including any notice of
                    copyright or trademark) posted by us or the licensors of the
                    application; (5) use the application for any revenue
                    generating endeavor, commercial enterprise, or other purpose
                    for which it is not designed or intended; (6) make the
                    application available over a network or other environment
                    permitting access or use by multiple devices or users at the
                    same time; (7) use the application for creating a product,
                    service, or software that is, directly or indirectly,
                    competitive with or in any way a substitute for the
                    application; (8) use the application to send automated
                    queries to any website or to send any unsolicited commercial
                    e-mail; or (9) use any proprietary information or any of our
                    interfaces or our other intellectual property in the design,
                    development, manufacture, licensing, or distribution of any
                    applications, accessories, or devices for use with the
                    application.
                  </span>
                </div>
                <div className="MsoNormal" style={{ lineHeight: 1 }}>
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_2"
                  style={{ lineHeight: '1.5' }}
                >
                  <span
                    style={{
                      fontSize: '11pt',
                      lineHeight: '16.8667px',
                      color: 'rgb(89, 89, 89)',
                    }}
                  >
                    <strong>Apple and Android Devices</strong>
                  </span>
                </div>
                <div className="MsoNormal" style={{ lineHeight: 1 }}>
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5' }}
                >
                  <span
                    style={{
                      fontSize: '11pt',
                      lineHeight: '16.8667px',
                      color: 'rgb(89, 89, 89)',
                    }}
                  >
                    The following terms apply when you use a mobile application
                    obtained from either the Apple Store or Google Play (each an
                    “App Distributor”) to access the Marketplace Offerings: (1)
                    the license granted to you for our mobile application is
                    limited to a non-transferable license to use the application
                    on a device that utilizes the Apple iOS or Android operating
                    systems, as applicable, and in accordance with the usage
                    rules set forth in the applicable App Distributor’s terms of
                    service; (2) we are responsible for providing any
                    maintenance and support services with respect to the mobile
                    application as specified in the terms and conditions of this
                    mobile application license contained in these Terms of Use
                    or as otherwise required under applicable law, and you
                    acknowledge that each App Distributor has no obligation
                    whatsoever to furnish any maintenance and support services
                    with respect to the mobile application; (3) in the event of
                    any failure of the mobile application to conform to any
                    applicable warranty, you may notify the applicable App
                    Distributor, and the App Distributor, in accordance with its
                    terms and policies, may refund the purchase price, if any,
                    paid for the mobile application, and to the maximum extent
                    permitted by applicable law, the App Distributor will have
                    no other warranty obligation whatsoever with respect to the
                    mobile application; (4) you represent and warrant that (i)
                    you are not located in a country that is subject to a U.S.
                    government embargo, or that has been designated by the U.S.
                    government as a “terrorist supporting” country and (ii) you
                    are not listed on any U.S. government list of prohibited or
                    restricted parties; (5) you must comply with applicable
                    third-party terms of agreement when using the mobile
                    application, e.g., if you have a VoIP application, then you
                    must not be in violation of their wireless data service
                    agreement when using the mobile application; and (6) you
                    acknowledge and agree that the App Distributors are
                    third-party beneficiaries of the terms and conditions in
                    this mobile application license contained in these Terms of
                    Use, and that each App Distributor will have the right (and
                    will be deemed to have accepted the right) to enforce the
                    terms and conditions in this mobile application license
                    contained in these Terms of Use against you as a third-party
                    beneficiary thereof.
                  </span>
                </div>
                <div className="MsoNormal" style={{ lineHeight: '1.5' }}>
                  <br />
                </div>
                <div className="MsoNormal" style={{ lineHeight: '1.5' }}>
                  <br />
                </div>
                <div className="MsoNormal" style={{ lineHeight: '1.5' }}>
                  <span
                    style={{
                      fontSize: '11pt',
                      lineHeight: '16.8667px',
                      color: 'rgb(89, 89, 89)',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '11pt',
                        lineHeight: '16.8667px',
                        color: 'rgb(89, 89, 89)',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '11pt',
                          lineHeight: '16.8667px',
                          color: 'rgb(89, 89, 89)',
                        }}
                      >
                        <span
                          className="block-container if"
                          data-type="if"
                          style={{ textAlign: 'left' }}
                        >
                          <span
                            className="statement-end-if-in-editor"
                            data-type="close"
                          />
                        </span>
                      </span>
                    </span>
                  </span>
                </div>
                <div className="MsoNormal" style={{ lineHeight: '1.5' }}>
                  <span
                    className="block-container if"
                    data-type="if"
                    style={{ textAlign: 'left' }}
                  >
                    <span data-type="conditional-block">
                      <span
                        className="block-component"
                        data-record-question-key="socialnetwork_link_option"
                        data-type="statement"
                      />
                    </span>
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_1"
                  id="socialmedia"
                  style={{ lineHeight: '1.5' }}
                >
                  <strong>
                    <strong>
                      <span style={{ lineHeight: '24.5333px', fontSize: 19 }}>
                        <strong>
                          <span
                            style={{
                              lineHeight: '115%',
                              fontFamily: 'Arial',
                              fontSize: 19,
                            }}
                          >
                            <strong>
                              <span
                                style={{
                                  lineHeight: '115%',
                                  fontFamily: 'Arial',
                                  fontSize: 19,
                                }}
                              >
                                12.
                              </span>
                            </strong>
                          </span>
                          &nbsp;
                        </strong>
                      </span>
                    </strong>
                    SOCIAL MEDIA
                  </strong>
                </div>
                <div className="MsoNormal" style={{ lineHeight: '1.1' }}>
                  <br />
                  <span
                    className="block-container if"
                    data-type="if"
                    style={{ textAlign: 'left' }}
                  >
                    <span data-type="conditional-block">
                      <span data-type="body">
                        <div
                          className="MsoNormal"
                          data-custom-class="body_text"
                          style={{ lineHeight: '1.5' }}
                        >
                          <span
                            style={{
                              fontSize: '11pt',
                              lineHeight: '16.8667px',
                              color: 'rgb(89, 89, 89)',
                            }}
                          >
                            As part of the functionality of the Site, you may
                            link your account with online accounts you have with
                            third-party service providers (each such account, a
                            “Third-Party Account”) by either: (1) providing your
                            Third-Party Account login information through the
                            Site; or (2) allowing us to access your{' '}
                            <span style={{ fontSize: '14.6667px' }}>
                              Third-Party
                            </span>{' '}
                            Account, as is permitted under the applicable terms
                            and conditions that govern your use of each{' '}
                            <span style={{ fontSize: '14.6667px' }}>
                              Third-Party
                            </span>{' '}
                            Account. You represent and warrant that you are
                            entitled to disclose your{' '}
                            <span style={{ fontSize: '14.6667px' }}>
                              Third-Party
                            </span>{' '}
                            Account login information to us and/or grant us
                            access to your{' '}
                            <span style={{ fontSize: '14.6667px' }}>
                              Third-Party
                            </span>{' '}
                            Account, without breach by you of any of the terms
                            and conditions that govern your use of the
                            applicable{' '}
                            <span style={{ fontSize: '14.6667px' }}>
                              Third-Party
                            </span>{' '}
                            Account, and without obligating us to pay any fees
                            or making us subject to any usage limitations
                            imposed by the third-party service provider of the{' '}
                            <span style={{ fontSize: '14.6667px' }}>
                              Third-Party
                            </span>{' '}
                            Account. By granting us access to any{' '}
                            <span style={{ fontSize: '14.6667px' }}>
                              Third-Party
                            </span>{' '}
                            Accounts, you understand that (1) we may access,
                            make available, and store (if applicable) any
                            content that you have provided to and stored in your{' '}
                            <span style={{ fontSize: '14.6667px' }}>
                              Third-Party
                            </span>{' '}
                            Account (the “Social Network Content”) so that it is
                            available on and through the Site via your account,
                            including without limitation any friend lists and
                            (2) we may submit to and receive from your{' '}
                            <span style={{ fontSize: '14.6667px' }}>
                              Third-Party
                            </span>{' '}
                            Account additional information to the extent you are
                            notified when you link your account with the{' '}
                            <span style={{ fontSize: '14.6667px' }}>
                              Third-Party
                            </span>{' '}
                            Account. Depending on the{' '}
                            <span style={{ fontSize: '14.6667px' }}>
                              Third-Party
                            </span>{' '}
                            Accounts you choose and subject to the privacy
                            settings that you have set in such{' '}
                            <span style={{ fontSize: '14.6667px' }}>
                              Third-Party
                            </span>{' '}
                            Accounts, personally identifiable information that
                            you post to your{' '}
                            <span style={{ fontSize: '14.6667px' }}>
                              Third-Party
                            </span>{' '}
                            Accounts may be available on and through your
                            account on the Site. Please note that if a{' '}
                            <span style={{ fontSize: '14.6667px' }}>
                              Third-Party
                            </span>{' '}
                            Account or associated service becomes unavailable or
                            our access to such{' '}
                            <span style={{ fontSize: '14.6667px' }}>
                              Third-Party
                            </span>{' '}
                            Account is terminated by the third-party service
                            provider, then Social Network Content may no longer
                            be available on and through the Site. You will have
                            the ability to disable the connection between your
                            account on the Site and your{' '}
                            <span style={{ fontSize: '14.6667px' }}>
                              Third-Party
                            </span>{' '}
                            Accounts at any time. PLEASE NOTE THAT YOUR
                            RELATIONSHIP WITH THE THIRD-PARTY SERVICE PROVIDERS
                            ASSOCIATED WITH YOUR THIRD-PARTY ACCOUNTS IS
                            GOVERNED SOLELY BY YOUR AGREEMENT(S) WITH SUCH
                            THIRD-PARTY SERVICE PROVIDERS. We make no effort to
                            review any Social Network Content for any purpose,
                            including but not limited to, for accuracy,
                            legality, or non-infringement, and we are not
                            responsible for any Social Network Content. You
                            acknowledge and agree that we may access your email
                            address book associated with a{' '}
                            <span style={{ fontSize: '14.6667px' }}>
                              Third-Party
                            </span>{' '}
                            Account and your contacts list stored on your mobile
                            device or tablet computer solely for purposes of
                            identifying and informing you of those contacts who
                            have also registered to use the Site. You can
                            deactivate the connection between the Site and your{' '}
                            <span style={{ fontSize: '14.6667px' }}>
                              Third-Party
                            </span>{' '}
                            Account by contacting us using the contact
                            information below or through your account settings
                            (if applicable). We will attempt to delete any
                            information stored on our servers that was obtained
                            through such{' '}
                            <span style={{ fontSize: '14.6667px' }}>
                              Third-Party
                            </span>{' '}
                            Account, except the username and profile picture
                            that become associated with your account.
                          </span>
                        </div>
                      </span>
                    </span>
                  </span>
                </div>
                <div className="MsoNormal" style={{ lineHeight: '1.5' }}>
                  <br />
                </div>
                <div className="MsoNormal" style={{ lineHeight: '1.5' }}>
                  <br />
                </div>
                <div className="MsoNormal" style={{ lineHeight: '1.1' }}>
                  <span
                    className="block-container if"
                    data-type="if"
                    style={{ textAlign: 'left' }}
                  >
                    <span data-type="conditional-block">
                      <span data-type="body">
                        <div
                          className="MsoNormal"
                          style={{ lineHeight: '1.5' }}
                        >
                          <span
                            style={{
                              fontSize: '11pt',
                              lineHeight: '16.8667px',
                              color: 'rgb(89, 89, 89)',
                            }}
                          />
                        </div>
                      </span>
                    </span>
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_1"
                  id="submissions"
                  style={{ lineHeight: '1.1' }}
                >
                  <strong>
                    <span style={{ lineHeight: '24.5333px', fontSize: 19 }}>
                      <strong>
                        <span style={{ lineHeight: '24.5333px', fontSize: 19 }}>
                          <strong>
                            <span
                              style={{
                                lineHeight: '115%',
                                fontFamily: 'Arial',
                                fontSize: 19,
                              }}
                            >
                              <strong>
                                <span
                                  style={{
                                    lineHeight: '115%',
                                    fontFamily: 'Arial',
                                    fontSize: 19,
                                  }}
                                >
                                  13.
                                </span>
                              </strong>
                            </span>
                            &nbsp;
                          </strong>
                        </span>
                      </strong>
                      SUBMISSIONS
                    </span>
                  </strong>
                </div>
                <div className="MsoNormal" style={{ lineHeight: '1.1' }}>
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5' }}
                >
                  You acknowledge and agree that any questions, comments,
                  suggestions, ideas, feedback, or other information regarding
                  the Site or the Marketplace Offerings ("Submissions") provided
                  by you to us are non-confidential and shall become our sole
                  property. We shall own exclusive rights, including all
                  intellectual property rights, and shall be entitled to the
                  unrestricted use and dissemination of these Submissions for
                  any lawful purpose, commercial or otherwise, without
                  acknowledgment or compensation to you. You hereby waive all
                  moral rights to any such Submissions, and you hereby warrant
                  that any such Submissions are original with you or that you
                  have the right to submit such Submissions. You agree there
                  shall be no recourse against us for any alleged or actual
                  infringement or misappropriation of any proprietary right in
                  your Submissions.
                </div>
                <div className="MsoNormal" style={{ lineHeight: '1.5' }}>
                  <br />
                </div>
                <div className="MsoNormal" style={{ lineHeight: '1.5' }}>
                  <br />
                </div>
                <div className="MsoNormal" style={{ lineHeight: '1.5' }}>
                  <span
                    className="block-container if"
                    data-type="if"
                    style={{ textAlign: 'left' }}
                  >
                    <span data-type="conditional-block">
                      <span
                        className="block-component"
                        data-record-question-key="3rd_party_option"
                        data-type="statement"
                      />
                    </span>
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_1"
                  id="thirdparty"
                  style={{ lineHeight: '1.5' }}
                >
                  <strong>
                    <strong>
                      <span style={{ lineHeight: '24.5333px', fontSize: 19 }}>
                        <strong>
                          <span
                            style={{
                              lineHeight: '115%',
                              fontFamily: 'Arial',
                              fontSize: 19,
                            }}
                          >
                            <strong>
                              <span
                                style={{
                                  lineHeight: '115%',
                                  fontFamily: 'Arial',
                                  fontSize: 19,
                                }}
                              >
                                14.
                              </span>
                            </strong>
                          </span>
                          &nbsp;
                        </strong>
                      </span>
                    </strong>
                    THIRD-PARTY WEBSITES AND CONTENT
                  </strong>
                </div>
                <div className="MsoNormal" style={{ lineHeight: 1 }}>
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5' }}
                >
                  <span
                    style={{
                      fontSize: '11pt',
                      lineHeight: '16.8667px',
                      color: 'rgb(89, 89, 89)',
                    }}
                  >
                    The Site may contain (or you may be sent via the Site or the
                    Marketplace Offerings) links to other websites ("
                    <span style={{ fontSize: '14.6667px' }}>
                      Third-Party
                    </span>{' '}
                    Websites") as well as articles, photographs, text, graphics,
                    pictures, designs, music, sound, video, information,
                    applications, software, and other content or items belonging
                    to or originating from third parties ("Third-Party
                    Content"). Such{' '}
                    <span style={{ fontSize: '14.6667px' }}>Third-Party</span>{' '}
                    Websites and{' '}
                    <span style={{ fontSize: '14.6667px' }}>Third-Party</span>{' '}
                    Content are not investigated, monitored, or checked for
                    accuracy, appropriateness, or completeness by us, and we are
                    not responsible for any Third Party Websites accessed
                    through the Site or any{' '}
                    <span style={{ fontSize: '14.6667px' }}>Third-Party</span>{' '}
                    Content posted on, available through, or installed from the
                    Site, including the content, accuracy, offensiveness,
                    opinions, reliability, privacy practices, or other policies
                    of or contained in the{' '}
                    <span style={{ fontSize: '14.6667px' }}>Third-Party</span>{' '}
                    Websites or the{' '}
                    <span style={{ fontSize: '14.6667px' }}>Third-Party</span>{' '}
                    Content. Inclusion of, linking to, or permitting the use or
                    installation of any{' '}
                    <span style={{ fontSize: '14.6667px' }}>Third-Party</span>{' '}
                    Websites or any{' '}
                    <span style={{ fontSize: '14.6667px' }}>Third-Party</span>
                    Content does not imply approval or endorsement thereof by
                    us. If you decide to leave the Site and access the{' '}
                    <span style={{ fontSize: '14.6667px' }}>
                      Third-Party
                    </span>{' '}
                    Websites or to use or install any{' '}
                    <span style={{ fontSize: '14.6667px' }}>Third-Party</span>{' '}
                    Content, you do so at your own risk, and you should be aware
                    these Terms of Use no longer govern. You should review the
                    applicable terms and policies, including privacy and data
                    gathering practices, of any website to which you navigate
                    from the Site or relating to any applications you use or
                    install from the Site. Any purchases you make through{' '}
                    <span style={{ fontSize: '14.6667px' }}>Third-Party</span>{' '}
                    Websites will be through other websites and from other
                    companies, and we take no responsibility whatsoever in
                    relation to such purchases which are exclusively between you
                    and the applicable third party. You agree and acknowledge
                    that we do not endorse the products or services offered on{' '}
                    <span style={{ fontSize: '14.6667px' }}>Third-Party</span>{' '}
                    Websites and you shall hold us harmless from any harm caused
                    by your purchase of such products or services. Additionally,
                    you shall hold us harmless from any losses sustained by you
                    or harm caused to you relating to or resulting in any way
                    from any{' '}
                    <span style={{ fontSize: '14.6667px' }}>Third-Party</span>{' '}
                    Content or any contact with{' '}
                    <span style={{ fontSize: '14.6667px' }}>Third-Party</span>{' '}
                    Websites.
                  </span>
                </div>
                <div className="MsoNormal" style={{ lineHeight: '1.5' }}>
                  <br />
                </div>
                <div className="MsoNormal" style={{ lineHeight: '1.5' }}>
                  <br />
                </div>
                <div className="MsoNormal" style={{ lineHeight: '1.5' }}>
                  <span
                    className="block-container if"
                    data-type="if"
                    style={{ textAlign: 'left' }}
                  >
                    <span
                      className="statement-end-if-in-editor"
                      data-type="close"
                    />
                  </span>
                </div>
                <div className="MsoNormal" style={{ lineHeight: '1.5' }}>
                  <span
                    className="block-container if"
                    data-type="if"
                    style={{ textAlign: 'left' }}
                  >
                    <span data-type="conditional-block">
                      <span
                        className="block-component"
                        data-record-question-key="advertiser_option"
                        data-type="statement"
                      />
                    </span>
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_1"
                  id="sitemanage"
                  style={{ lineHeight: '1.5' }}
                >
                  <strong>
                    <span style={{ lineHeight: '24.5333px', fontSize: 19 }}>
                      <strong>
                        <span style={{ lineHeight: '24.5333px', fontSize: 19 }}>
                          <strong>
                            <span
                              style={{
                                lineHeight: '115%',
                                fontFamily: 'Arial',
                                fontSize: 19,
                              }}
                            >
                              <strong>
                                <span
                                  style={{
                                    lineHeight: '115%',
                                    fontFamily: 'Arial',
                                    fontSize: 19,
                                  }}
                                >
                                  15.
                                </span>
                              </strong>
                            </span>
                          </strong>
                        </span>
                        &nbsp;
                      </strong>
                      SITE MANAGEMENT
                    </span>
                  </strong>
                </div>
                <div className="MsoNormal" style={{ lineHeight: 1 }}>
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5' }}
                >
                  We reserve the right, but not the obligation, to: (1) monitor
                  the Site for violations of these Terms of Use; (2) take
                  appropriate legal action against anyone who, in our sole
                  discretion, violates the law or these Terms of Use, including
                  without limitation, reporting such user to law enforcement
                  authorities; (3) in our sole discretion and without
                  limitation, refuse, restrict access to, limit the availability
                  of, or disable (to the extent technologically feasible) any of
                  your Contributions or any portion thereof; (4) in our sole
                  discretion and without limitation, notice, or liability, to
                  remove from the Site or otherwise disable all files and
                  content that are excessive in size or are in any way
                  burdensome to our systems; and (5) otherwise manage the Site
                  in a manner designed to protect our rights and property and to
                  facilitate the proper functioning of the Site and the
                  Marketplace Offerings.
                </div>
                <div className="MsoNormal" style={{ lineHeight: '1.5' }}>
                  <br />
                </div>
                <div className="MsoNormal" style={{ lineHeight: '1.5' }}>
                  <br />
                </div>
                <div className="MsoNormal" style={{ lineHeight: '1.5' }}>
                  <span
                    className="block-container if"
                    data-type="if"
                    style={{ textAlign: 'left' }}
                  >
                    <span data-type="conditional-block">
                      <span
                        className="block-component"
                        data-record-question-key="privacy_policy_option"
                        data-type="statement"
                      />
                    </span>
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_1"
                  id="privacypolicy"
                  style={{ lineHeight: '1.5' }}
                >
                  <strong>
                    <strong>
                      <span style={{ lineHeight: '24.5333px', fontSize: 19 }}>
                        <strong>
                          <span
                            style={{
                              lineHeight: '115%',
                              fontFamily: 'Arial',
                              fontSize: 19,
                            }}
                          >
                            <strong>
                              <span
                                style={{
                                  lineHeight: '115%',
                                  fontFamily: 'Arial',
                                  fontSize: 19,
                                }}
                              >
                                16.
                              </span>
                            </strong>
                          </span>
                        </strong>
                      </span>
                      &nbsp;
                    </strong>
                    PRIVACY POLICY
                  </strong>
                </div>
                <div className="MsoNormal" style={{ lineHeight: 1 }}>
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5' }}
                >
                  <span
                    style={{
                      fontSize: '11pt',
                      lineHeight: '16.8667px',
                      color: 'rgb(89, 89, 89)',
                    }}
                  >
                    We care about data privacy and security. Please review our
                    Privacy Policy:
                    <strong>
                      &nbsp;
                      <span
                        className="block-container question question-in-editor"
                        data-id="d10c7fd7-0685-12ac-c717-cbc45ff916d1"
                        data-type="question"
                      >
                        https://manifold.markets/privacy
                      </span>
                    </strong>
                    . By using the Site or the Marketplace Offerings, you agree
                    to be bound by our Privacy Policy, which is incorporated
                    into these Terms of Use. Please be advised the Site and the
                    Marketplace Offerings are hosted in{' '}
                    <span className="block-component" />
                    the <span className="question">United States</span>
                    <span className="block-component" />. If you access the Site
                    or the Marketplace Offerings from any other region of the
                    world with laws or other requirements governing personal
                    data collection, use, or disclosure that differ from
                    applicable laws in{' '}
                    <span
                      style={{
                        fontSize: '11pt',
                        lineHeight: '16.8667px',
                        color: 'rgb(89, 89, 89)',
                      }}
                    >
                      <span className="block-component" />
                      the <span className="question">United States</span>
                      <span className="block-component" />
                    </span>
                    , then through your continued use of the Site, you are
                    transferring your data to{' '}
                    <span
                      style={{
                        fontSize: '11pt',
                        lineHeight: '16.8667px',
                        color: 'rgb(89, 89, 89)',
                      }}
                    >
                      <span className="block-component" />
                      the <span className="question">United States</span>
                      <span className="block-component" />
                    </span>
                    , and you expressly consent to have your data transferred to
                    and processed in{' '}
                    <span
                      style={{
                        fontSize: '11pt',
                        lineHeight: '16.8667px',
                        color: 'rgb(89, 89, 89)',
                      }}
                    >
                      <span className="block-component" />
                      the <span className="question">United States</span>
                      <span className="block-component" />
                    </span>
                    .<span className="block-component" />
                    <span
                      className="block-container if"
                      data-type="if"
                      id="547bb7bb-ecf2-84b9-1cbb-a861dc3e14e7"
                    >
                      <span data-type="conditional-block">
                        <span
                          className="block-component"
                          data-record-question-key="user_u13_option"
                          data-type="statement"
                        />{' '}
                        <span data-type="body">
                          Further, we do not knowingly accept, request, or
                          solicit information from children or knowingly market
                          to children. Therefore, in accordance with the U.S.
                          Children’s Online Privacy Protection Act, if we
                          receive actual knowledge that anyone under the age of
                          13 has provided personal information to us without the
                          requisite and verifiable parental consent, we will
                          delete that information from the Site as quickly as is
                          reasonably practical.
                        </span>
                      </span>
                      <span
                        className="statement-end-if-in-editor"
                        data-type="close"
                      >
                        <span
                          style={{
                            fontSize: '11pt',
                            lineHeight: '16.8667px',
                            color: 'rgb(89, 89, 89)',
                          }}
                        >
                          <span className="statement-end-if-in-editor" />
                        </span>
                      </span>
                    </span>
                  </span>
                </div>
                <div className="MsoNormal" style={{ lineHeight: '1.5' }}>
                  <br />
                </div>
                <div className="MsoNormal" style={{ lineHeight: '1.5' }}>
                  <br />
                </div>
                <div className="MsoNormal" style={{ lineHeight: '1.5' }}>
                  <span
                    className="block-container if"
                    data-type="if"
                    style={{ textAlign: 'left' }}
                  >
                    <span
                      className="statement-end-if-in-editor"
                      data-type="close"
                    />
                  </span>
                  <span className="block-container if" data-type="if">
                    <span data-type="conditional-block">
                      <span
                        className="block-component"
                        data-record-question-key="privacy_policy_followup"
                        data-type="statement"
                        style={{ fontSize: '14.6667px' }}
                      />
                    </span>
                  </span>
                </div>
                <div className="MsoNormal" style={{ lineHeight: '1.5' }}>
                  <span
                    className="block-container if"
                    data-type="if"
                    style={{ textAlign: 'left' }}
                  >
                    <span data-type="conditional-block">
                      <span
                        className="block-component"
                        data-record-question-key="copyright_agent_option"
                        data-type="statement"
                      >
                        <span className="block-component" />
                        <span className="block-component" />
                      </span>
                      <span
                        className="block-container if"
                        data-type="if"
                        style={{ textAlign: 'left' }}
                      >
                        <span
                          className="statement-end-if-in-editor"
                          data-type="close"
                        />
                      </span>
                    </span>
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span className="block-component" />
                  <span
                    className="block-container if"
                    data-type="if"
                    style={{ textAlign: 'left' }}
                  >
                    <span
                      className="statement-end-if-in-editor"
                      data-type="close"
                    >
                      <span className="block-component" />
                    </span>
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_1"
                  id="copyright"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <strong>
                    <span style={{ fontSize: 19 }}>
                      <strong>
                        <span style={{ lineHeight: '24.5333px', fontSize: 19 }}>
                          <strong>
                            <span
                              style={{
                                lineHeight: '115%',
                                fontFamily: 'Arial',
                                fontSize: 19,
                              }}
                            >
                              <strong>
                                <span
                                  style={{
                                    lineHeight: '115%',
                                    fontFamily: 'Arial',
                                    fontSize: 19,
                                  }}
                                >
                                  17.
                                </span>
                              </strong>
                            </span>
                          </strong>
                        </span>
                        &nbsp;
                      </strong>
                      COPYRIGHT INFRINGEMENTS
                    </span>
                  </strong>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: 1, textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span
                    style={{
                      fontSize: '11pt',
                      lineHeight: '16.8667px',
                      color: 'rgb(89, 89, 89)',
                    }}
                  >
                    We respect the intellectual property rights of others. If
                    you believe that any material available on or through the
                    Site infringes upon any copyright you own or control, please
                    immediately notify us using the contact information provided
                    below (a “Notification”). A copy of your Notification will
                    be sent to the person who posted or stored the material
                    addressed in the Notification. Please be advised that
                    pursuant to applicable law you may be held liable for
                    damages if you make material misrepresentations in a
                    Notification. Thus, if you are not sure that material
                    located on or linked to by the Site infringes your
                    copyright, you should consider first contacting an attorney.
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span
                    className="block-container if"
                    data-type="if"
                    style={{ textAlign: 'left' }}
                  >
                    <span
                      className="statement-end-if-in-editor"
                      data-type="close"
                    />
                  </span>
                  <span className="block-component" />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_1"
                  id="terms"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <strong>
                    <span style={{ lineHeight: '24.5333px', fontSize: 19 }}>
                      <strong>
                        <span style={{ lineHeight: '24.5333px', fontSize: 19 }}>
                          <strong>
                            <span
                              style={{
                                lineHeight: '115%',
                                fontFamily: 'Arial',
                                fontSize: 19,
                              }}
                            >
                              <strong>
                                <span
                                  style={{
                                    lineHeight: '115%',
                                    fontFamily: 'Arial',
                                    fontSize: 19,
                                  }}
                                >
                                  18.
                                </span>
                              </strong>
                            </span>
                          </strong>
                        </span>
                        &nbsp;
                      </strong>
                      TERM AND TERMINATION
                    </span>
                  </strong>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: 1, textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span
                    style={{
                      fontSize: '11pt',
                      lineHeight: '16.8667px',
                      color: 'rgb(89, 89, 89)',
                    }}
                  >
                    These Terms of Use shall remain in full force and effect
                    while you use the Site. WITHOUT LIMITING ANY OTHER PROVISION
                    OF THESE TERMS OF USE, WE RESERVE THE RIGHT TO, IN OUR SOLE
                    DISCRETION AND WITHOUT NOTICE OR LIABILITY, DENY ACCESS TO
                    AND USE OF THE SITE AND THE MARKETPLACE OFFERINGS (INCLUDING
                    BLOCKING CERTAIN IP ADDRESSES), TO ANY PERSON FOR ANY REASON
                    OR FOR NO REASON, INCLUDING WITHOUT LIMITATION FOR BREACH OF
                    ANY REPRESENTATION, WARRANTY, OR COVENANT CONTAINED IN THESE
                    TERMS OF USE OR OF ANY APPLICABLE LAW OR REGULATION. WE MAY
                    TERMINATE YOUR USE OR PARTICIPATION IN THE SITE AND THE
                    MARKETPLACE OFFERINGS OR DELETE{' '}
                    <span
                      className="block-container if"
                      data-type="if"
                      id="a6e121c2-36b4-5066-bf9f-a0a33512e768"
                    >
                      <span data-type="conditional-block">
                        <span
                          className="block-component"
                          data-record-question-key="user_account_option"
                          data-type="statement"
                        />
                        <span data-type="body">YOUR ACCOUNT AND&nbsp;</span>
                      </span>
                      <span
                        className="statement-end-if-in-editor"
                        data-type="close"
                      />
                    </span>
                    ANY CONTENT OR INFORMATION THAT YOU POSTED AT ANY TIME,
                    WITHOUT WARNING, IN OUR SOLE DISCRETION.
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: 1, textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span
                    style={{
                      fontSize: '11pt',
                      lineHeight: '16.8667px',
                      color: 'rgb(89, 89, 89)',
                    }}
                  >
                    If we terminate or suspend your account for any reason, you
                    are prohibited from registering and creating a new account
                    under your name, a fake or borrowed name, or the name of any
                    third party, even if you may be acting on behalf of the
                    third party. In addition to terminating or suspending your
                    account, we reserve the right to take appropriate legal
                    action, including without limitation pursuing civil,
                    criminal, and injunctive redress.
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_1"
                  id="modifications"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <strong>
                    <span style={{ lineHeight: '24.5333px', fontSize: 19 }}>
                      <strong>
                        <span style={{ lineHeight: '24.5333px', fontSize: 19 }}>
                          <strong>
                            <span
                              style={{
                                lineHeight: '115%',
                                fontFamily: 'Arial',
                                fontSize: 19,
                              }}
                            >
                              <strong>
                                <span
                                  style={{
                                    lineHeight: '115%',
                                    fontFamily: 'Arial',
                                    fontSize: 19,
                                  }}
                                >
                                  19.
                                </span>
                              </strong>
                            </span>
                          </strong>
                        </span>
                        &nbsp;
                      </strong>
                      MODIFICATIONS AND INTERRUPTIONS
                    </span>
                  </strong>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: 1, textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span
                    style={{
                      fontSize: '11pt',
                      lineHeight: '16.8667px',
                      color: 'rgb(89, 89, 89)',
                    }}
                  >
                    We reserve the right to change, modify, or remove the
                    contents of the Site at any time or for any reason at our
                    sole discretion without notice. However, we have no
                    obligation to update any information on our Site. We also
                    reserve the right to modify or discontinue all or part of
                    the Marketplace Offerings without notice at any time. We
                    will not be liable to you or any third party for any
                    modification, price change, suspension, or discontinuance of
                    the Site or the Marketplace Offerings.
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: 1, textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span
                    style={{
                      fontSize: '11pt',
                      lineHeight: '16.8667px',
                      color: 'rgb(89, 89, 89)',
                    }}
                  >
                    We cannot guarantee the Site and the Marketplace Offerings
                    will be available at all times. We may experience hardware,
                    software, or other problems or need to perform maintenance
                    related to the Site, resulting in interruptions, delays, or
                    errors. We reserve the right to change, revise, update,
                    suspend, discontinue, or otherwise modify the Site or the
                    Marketplace Offerings at any time or for any reason without
                    notice to you. You agree that we have no liability
                    whatsoever for any loss, damage, or inconvenience caused by
                    your inability to access or use the Site or the Marketplace
                    Offerings during any downtime or discontinuance of the Site
                    or the Marketplace Offerings. Nothing in these Terms of Use
                    will be construed to obligate us to maintain and support the
                    Site or the Marketplace Offerings or to supply any
                    corrections, updates, or releases in connection therewith.
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_1"
                  id="law"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <strong>
                    <span style={{ lineHeight: '24.5333px', fontSize: 19 }}>
                      <strong>
                        <span style={{ lineHeight: '24.5333px', fontSize: 19 }}>
                          <strong>
                            <span
                              style={{
                                lineHeight: '115%',
                                fontFamily: 'Arial',
                                fontSize: 19,
                              }}
                            >
                              <strong>
                                <span
                                  style={{
                                    lineHeight: '115%',
                                    fontFamily: 'Arial',
                                    fontSize: 19,
                                  }}
                                >
                                  20.
                                </span>
                              </strong>
                            </span>
                          </strong>
                        </span>
                        &nbsp;
                      </strong>
                      GOVERNING LAW
                    </span>
                  </strong>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span
                    style={{
                      fontSize: '11pt',
                      lineHeight: '16.8667px',
                      color: 'rgb(89, 89, 89)',
                    }}
                  >
                    <span className="block-component" />
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span
                    style={{
                      fontSize: '11pt',
                      lineHeight: '16.8667px',
                      color: 'rgb(89, 89, 89)',
                    }}
                  >
                    These Terms of Use and your use of the Site and the
                    Marketplace Offerings are governed by and construed in
                    accordance with the laws of{' '}
                    <span
                      className="block-container if"
                      data-type="if"
                      id="b86653c1-52f0-c88c-a218-e300b912dd6b"
                    >
                      <span data-type="conditional-block">
                        <span
                          className="block-component"
                          data-record-question-key="governing_law"
                          data-type="statement"
                        />
                        <span data-type="body">
                          the State of{' '}
                          <span
                            className="block-container question question-in-editor"
                            data-id="b61250bd-6b61-32ea-a9e7-4a02690297c3"
                            data-type="question"
                          >
                            Delaware
                          </span>
                        </span>
                      </span>
                      <span
                        className="statement-end-if-in-editor"
                        data-type="close"
                      />
                    </span>{' '}
                    applicable to agreements made and to be entirely performed
                    within
                    <span
                      className="block-container if"
                      data-type="if"
                      id="b86653c1-52f0-c88c-a218-e300b912dd6b"
                      style={{ fontSize: '14.6667px' }}
                    >
                      <span data-type="conditional-block">
                        &nbsp;
                        <span
                          style={{
                            fontSize: '11pt',
                            lineHeight: '16.8667px',
                            color: 'rgb(89, 89, 89)',
                          }}
                        >
                          <span
                            className="block-container if"
                            data-type="if"
                            id="b86653c1-52f0-c88c-a218-e300b912dd6b"
                          >
                            <span data-type="conditional-block">
                              <span
                                className="block-component"
                                data-record-question-key="governing_law"
                                data-type="statement"
                              />
                              <span data-type="body">
                                the State of{' '}
                                <span
                                  className="block-container question question-in-editor"
                                  data-id="b61250bd-6b61-32ea-a9e7-4a02690297c3"
                                  data-type="question"
                                >
                                  Delaware
                                </span>
                              </span>
                            </span>
                            <span
                              className="statement-end-if-in-editor"
                              data-type="close"
                            />
                          </span>
                          <span style={{ fontSize: '14.6667px' }}>,&nbsp;</span>
                          without regard to its conflict of law principles.{' '}
                          <span className="block-component" />
                        </span>
                      </span>
                    </span>
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_1"
                  id="disputes"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <strong>
                    <span style={{ lineHeight: '24.5333px', fontSize: 19 }}>
                      <strong>
                        <span style={{ lineHeight: '24.5333px', fontSize: 19 }}>
                          <strong>
                            <span
                              style={{
                                lineHeight: '115%',
                                fontFamily: 'Arial',
                                fontSize: 19,
                              }}
                            >
                              <strong>
                                <span
                                  style={{
                                    lineHeight: '115%',
                                    fontFamily: 'Arial',
                                    fontSize: 19,
                                  }}
                                >
                                  21.
                                </span>
                              </strong>
                            </span>
                          </strong>
                        </span>
                        &nbsp;
                      </strong>
                      DISPUTE RESOLUTION
                    </span>
                  </strong>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: 1, textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span className="block-component" />
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span className="block-component" />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_2"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <strong>Informal Negotiations</strong>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: 1, textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span style={{ fontSize: 15 }}>
                    To expedite resolution and control the cost of any dispute,
                    controversy, or claim related to these Terms of Use (each
                    "Dispute" and collectively, the “Disputes”) brought by
                    either you or us (individually, a “Party” and collectively,
                    the “Parties”), the Parties agree to first attempt to
                    negotiate any Dispute (except those Disputes expressly
                    provided below) informally for at least{' '}
                    <span className="question">thirty (30)</span> days before
                    initiating arbitration. Such informal negotiations commence
                    upon written notice from one Party to the other Party.
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: 1, textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span className="statement-end-if-in-editor" />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_2"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <strong>Binding Arbitration</strong>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: 1, textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span className="block-component">
                    <span style={{ fontSize: 15 }} />
                  </span>
                  <span style={{ fontSize: 15 }}>
                    If the Parties are unable to resolve a Dispute through
                    informal negotiations, the Dispute (except those Disputes
                    expressly excluded below) will be finally and exclusively
                    resolved by binding arbitration. YOU UNDERSTAND THAT WITHOUT
                    THIS PROVISION, YOU WOULD HAVE THE RIGHT TO SUE IN COURT AND
                    HAVE A JURY TRIAL. The arbitration shall be commenced and
                    conducted under the Commercial Arbitration Rules of the
                    American Arbitration Association ("AAA") and, where
                    appropriate, the AAA’s Supplementary Procedures for Consumer
                    Related Disputes ("AAA Consumer Rules"), both of which are
                    available at the AAA website{' '}
                    <span
                      style={{
                        fontSize: 15,
                        lineHeight: '16.8667px',
                        color: 'rgb(89, 89, 89)',
                      }}
                    >
                      <a
                        data-custom-class="link"
                        href="http://www.adr.org"
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        www.adr.org
                      </a>
                    </span>
                    . Your arbitration fees and your share of arbitrator
                    compensation shall be governed by the AAA Consumer Rules
                    and, where appropriate, limited by the AAA Consumer Rules.{' '}
                    <span className="block-component" />
                    The arbitration may be conducted in person, through the
                    submission of documents, by phone, or online. The arbitrator
                    will make a decision in writing, but need not provide a
                    statement of reasons unless requested by either Party. The
                    arbitrator must follow applicable law, and any award may be
                    challenged if the arbitrator fails to do so. Except where
                    otherwise required by the applicable AAA rules or applicable
                    law, the arbitration will take place in{' '}
                    <span className="block-component" />{' '}
                    <span className="question">United States</span>,
                    <span className="statement-end-if-in-editor" />{' '}
                    <span className="block-component" />
                    <span className="question">Delaware</span>
                    <span className="statement-end-if-in-editor" />. Except as
                    otherwise provided herein, the Parties may litigate in court
                    to compel arbitration, stay proceedings pending arbitration,
                    or to confirm, modify, vacate, or enter judgment on the
                    award entered by the arbitrator.
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: 1, textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span style={{ fontSize: 15 }}>
                    If for any reason, a Dispute proceeds in court rather than
                    arbitration, the Dispute shall be commenced or prosecuted in
                    the
                  </span>
                  <span className="block-component" style={{ fontSize: 15 }} />
                  <span style={{ fontSize: 15 }}>
                    &nbsp;state and federal courts
                  </span>
                  <span
                    className="statement-end-if-in-editor"
                    style={{ fontSize: 15 }}
                  />
                  <span style={{ fontSize: 15 }}>&nbsp;located in</span>
                  <span
                    className="block-component"
                    style={{ fontSize: 15 }}
                  />{' '}
                  <span className="block-component" style={{ fontSize: 15 }} />
                  <span className="question" style={{ fontSize: 15 }}>
                    Delaware
                  </span>
                  <span
                    className="statement-end-if-in-editor"
                    style={{ fontSize: 15 }}
                  />
                  <span style={{ fontSize: 15 }}>
                    , and the Parties hereby consent to, and waive all defenses
                    of lack of personal jurisdiction, and forum non conveniens
                    with respect to venue and jurisdiction in such
                    <span className="block-component" /> state and federal
                    courts
                    <span className="statement-end-if-in-editor" />. Application
                    of the United Nations Convention on Contracts for the
                    International Sale of Goods and the Uniform Computer
                    Information Transaction Act (UCITA) are excluded from these
                    Terms of Use.
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: 1, textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span style={{ fontSize: 15 }}>
                    <span className="block-component" />
                    In no event shall any Dispute brought by either Party
                    related in any way to the Site be commenced more than{' '}
                    <span className="question">one (1)</span> years after the
                    cause of action arose.{' '}
                    <span className="statement-end-if-in-editor" />
                    If this provision is found to be illegal or unenforceable,
                    then neither Party will elect to arbitrate any Dispute
                    falling within that portion of this provision found to be
                    illegal or unenforceable and such Dispute shall be decided
                    by a court of competent jurisdiction within the courts
                    listed for jurisdiction above, and the Parties agree to
                    submit to the personal jurisdiction of that court.
                    <span className="block-component" />
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: 1, textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_2"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <strong>Restrictions</strong>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: 1, textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  The Parties agree that any arbitration shall be limited to the
                  Dispute between the Parties individually. To the full extent
                  permitted by law, (a) no arbitration shall be joined with any
                  other proceeding; (b) there is no right or authority for any
                  Dispute to be arbitrated on a class-action basis or to utilize
                  class action procedures; and (c) there is no right or
                  authority for any Dispute to be brought in a purported
                  representative capacity on behalf of the general public or any
                  other persons.
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: 1, textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_2"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span className="block-component" />
                  <strong>
                    Exceptions to Informal Negotiations and Arbitration
                  </strong>
                  <span className="statement-end-if-in-editor" />
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: 1, textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span className="block-component" />
                  The Parties agree that the following Disputes are not subject
                  to the above provisions concerning informal negotiations
                  binding arbitration: (a) any Disputes seeking to enforce or
                  protect, or concerning the validity of, any of the
                  intellectual property rights of a Party; (b) any Dispute
                  related to, or arising from, allegations of theft, piracy,
                  invasion of privacy, or unauthorized use; and (c) any claim
                  for injunctive relief. If this provision is found to be
                  illegal or unenforceable, then neither Party will elect to
                  arbitrate any Dispute falling within that portion of this
                  provision found to be illegal or unenforceable and such
                  Dispute shall be decided by a court of competent jurisdiction
                  within the courts listed for jurisdiction above, and the
                  Parties agree to submit to the personal jurisdiction of that
                  court.
                  <span className="statement-end-if-in-editor" />
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span className="statement-end-if-in-editor">
                    <span className="statement-end-if-in-editor" />
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_1"
                  id="corrections"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <strong>
                    <span style={{ fontSize: 19 }}>
                      <strong>
                        <span style={{ lineHeight: '24.5333px', fontSize: 19 }}>
                          <strong>
                            <span
                              style={{
                                lineHeight: '115%',
                                fontFamily: 'Arial',
                                fontSize: 19,
                              }}
                            >
                              <strong>
                                <span
                                  style={{
                                    lineHeight: '115%',
                                    fontFamily: 'Arial',
                                    fontSize: 19,
                                  }}
                                >
                                  22.
                                </span>
                              </strong>
                            </span>
                          </strong>
                        </span>
                        &nbsp;
                      </strong>
                      CORRECTIONS
                    </span>
                  </strong>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: 1, textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  There may be information on the Site that contains
                  typographical errors, inaccuracies, or omissions that may
                  relate to the Marketplace Offerings, including descriptions,
                  pricing, availability, and various other information. We
                  reserve the right to correct any errors, inaccuracies, or
                  omissions and to change or update the information on the Site
                  at any time, without prior notice.
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_1"
                  id="disclaimer"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span style={{ fontSize: 19, color: 'rgb(0, 0, 0)' }}>
                    <strong>
                      <strong>
                        <span style={{ lineHeight: '24.5333px', fontSize: 19 }}>
                          <strong>
                            <span
                              style={{
                                lineHeight: '115%',
                                fontFamily: 'Arial',
                                fontSize: 19,
                              }}
                            >
                              <strong>
                                <span
                                  style={{
                                    lineHeight: '115%',
                                    fontFamily: 'Arial',
                                    fontSize: 19,
                                  }}
                                >
                                  23.
                                </span>
                              </strong>
                            </span>
                          </strong>
                        </span>
                        &nbsp;
                      </strong>
                      DISCLAIMER
                    </strong>
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: 1, textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    THE SITE IS PROVIDED ON AN AS-IS AND AS-AVAILABLE BASIS. YOU
                    AGREE THAT YOUR USE OF THE SITE SERVICES WILL BE AT YOUR
                    SOLE RISK. TO THE FULLEST EXTENT PERMITTED BY LAW, WE
                    DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, IN CONNECTION
                    WITH THE SITE AND YOUR USE THEREOF, INCLUDING, WITHOUT
                    LIMITATION, THE IMPLIED WARRANTIES OF MERCHANTABILITY,
                    FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE
                    MAKE NO WARRANTIES OR REPRESENTATIONS ABOUT THE ACCURACY OR
                    COMPLETENESS OF THE SITE’S CONTENT OR THE CONTENT OF ANY
                    WEBSITES LINKED TO THIS SITE AND WE WILL ASSUME NO LIABILITY
                    OR RESPONSIBILITY FOR ANY (1) ERRORS, MISTAKES, OR
                    INACCURACIES OF CONTENT AND MATERIALS, (2) PERSONAL INJURY
                    OR PROPERTY DAMAGE, OF ANY NATURE WHATSOEVER, RESULTING FROM
                    YOUR ACCESS TO AND USE OF THE SITE, (3) ANY UNAUTHORIZED
                    ACCESS TO OR USE OF OUR SECURE SERVERS AND/OR ANY AND ALL
                    PERSONAL INFORMATION AND/OR FINANCIAL INFORMATION STORED
                    THEREIN, (4) ANY INTERRUPTION OR CESSATION OF TRANSMISSION
                    TO OR FROM THE SITE, (5) ANY BUGS, VIRUSES, TROJAN HORSES,
                    OR THE LIKE WHICH MAY BE TRANSMITTED TO OR THROUGH THE SITE
                    BY ANY THIRD PARTY, AND/OR (6) ANY ERRORS OR OMISSIONS IN
                    ANY CONTENT AND MATERIALS OR FOR ANY LOSS OR DAMAGE OF ANY
                    KIND INCURRED AS A RESULT OF THE USE OF ANY CONTENT POSTED,
                    TRANSMITTED, OR OTHERWISE MADE AVAILABLE VIA THE SITE. WE DO
                    NOT WARRANT, ENDORSE, GUARANTEE, OR ASSUME RESPONSIBILITY
                    FOR ANY PRODUCT OR SERVICE ADVERTISED OR OFFERED BY A THIRD
                    PARTY THROUGH THE SITE, ANY HYPERLINKED WEBSITE, OR ANY
                    WEBSITE OR MOBILE APPLICATION FEATURED IN ANY BANNER OR
                    OTHER ADVERTISING, AND WE WILL NOT BE A PARTY TO OR IN ANY
                    WAY BE RESPONSIBLE FOR MONITORING ANY TRANSACTION BETWEEN
                    YOU AND ANY THIRD-PARTY PROVIDERS OF PRODUCTS OR SERVICES.
                    AS WITH THE PURCHASE OF A PRODUCT OR SERVICE THROUGH ANY
                    MEDIUM OR IN ANY ENVIRONMENT, YOU SHOULD USE YOUR BEST
                    JUDGMENT AND EXERCISE CAUTION WHERE APPROPRIATE.
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_1"
                  id="liability"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <strong>
                    <span
                      style={{
                        lineHeight: '115%',
                        fontFamily: 'Arial',
                        fontSize: 19,
                      }}
                    >
                      <strong>
                        <span style={{ lineHeight: '24.5333px', fontSize: 19 }}>
                          <strong>
                            <span
                              style={{
                                lineHeight: '115%',
                                fontFamily: 'Arial',
                                fontSize: 19,
                              }}
                            >
                              <strong>
                                <span
                                  style={{
                                    lineHeight: '115%',
                                    fontFamily: 'Arial',
                                    fontSize: 19,
                                  }}
                                >
                                  24.
                                </span>
                              </strong>
                            </span>
                          </strong>
                        </span>
                        &nbsp;
                      </strong>
                      LIMITATIONS OF LIABILITY
                    </span>
                  </strong>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: 1, textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    <span data-custom-class="body_text">
                      IN NO EVENT WILL WE OR OUR DIRECTORS, EMPLOYEES, OR AGENTS
                      BE LIABLE TO YOU OR ANY THIRD PARTY FOR ANY DIRECT,
                      INDIRECT, CONSEQUENTIAL, EXEMPLARY, INCIDENTAL, SPECIAL,
                      OR PUNITIVE DAMAGES, INCLUDING LOST PROFIT, LOST REVENUE,
                      LOSS OF DATA, OR OTHER DAMAGES ARISING FROM YOUR USE OF
                      THE SITE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY
                      OF SUCH DAMAGES.
                    </span>{' '}
                    <span
                      className="block-container if"
                      data-type="if"
                      id="3c3071ce-c603-4812-b8ca-ac40b91b9943"
                    >
                      <span data-custom-class="body_text">
                        <span data-type="conditional-block">
                          <span
                            className="block-component"
                            data-record-question-key="limitations_liability_option"
                            data-type="statement"
                          />
                          <span data-type="body">
                            NOTWITHSTANDING ANYTHING TO THE CONTRARY CONTAINED
                            HEREIN, OUR LIABILITY TO YOU FOR ANY CAUSE
                            WHATSOEVER AND REGARDLESS OF THE FORM OF THE ACTION,
                            WILL AT ALL TIMES BE LIMITED TO{' '}
                            <span
                              className="block-container if"
                              data-type="if"
                              id="73189d93-ed3a-d597-3efc-15956fa8e04e"
                            >
                              <span data-type="conditional-block">
                                <span
                                  className="block-component"
                                  data-record-question-key="limitations_liability_option"
                                  data-type="statement"
                                />{' '}
                                <span data-type="body">
                                  THE LESSER OF THE AMOUNT PAID, IF ANY, BY YOU
                                  TO US
                                  <span data-type="conditional-block">
                                    <span
                                      className="block-component"
                                      data-record-question-key="limilation_liability_time_option"
                                      data-type="statement"
                                    />{' '}
                                    <span data-type="body">
                                      <span
                                        style={{
                                          fontSize: '11pt',
                                          color: 'rgb(89, 89, 89)',
                                          textTransform: 'uppercase',
                                        }}
                                      >
                                        DURING THE{' '}
                                        <span
                                          className="block-container question question-in-editor"
                                          data-id="98461079-8520-8e55-edbd-84fdc37a26d4"
                                          data-type="question"
                                        >
                                          six (6)
                                        </span>{' '}
                                        MONTH PERIOD PRIOR TO ANY CAUSE OF
                                        ACTION ARISING.
                                      </span>
                                    </span>
                                  </span>
                                </span>
                              </span>
                            </span>
                            <span
                              style={{
                                fontSize: '11.0pt',
                                lineHeight: '115%',
                                fontFamily: 'Arial',
                                color: '#595959',
                                msoThemecolor: 'text1',
                                msoThemetint: 166,
                              }}
                            >
                              <span
                                className="block-container if"
                                data-type="if"
                                id="3c3071ce-c603-4812-b8ca-ac40b91b9943"
                              >
                                <span
                                  className="statement-end-if-in-editor"
                                  data-type="close"
                                >
                                  <span data-custom-class="body_text">
                                    .&nbsp;
                                  </span>
                                </span>
                              </span>
                            </span>
                            <span data-custom-class="body_text">
                              CERTAIN US STATE LAWS AND INTERNATIONAL LAWS DO
                              NOT ALLOW LIMITATIONS ON IMPLIED WARRANTIES OR THE
                              EXCLUSION OR LIMITATION OF CERTAIN DAMAGES. IF
                              THESE LAWS APPLY TO YOU, SOME OR ALL OF THE ABOVE
                              DISCLAIMERS OR LIMITATIONS MAY NOT APPLY TO YOU,
                              AND YOU MAY HAVE ADDITIONAL RIGHTS.
                            </span>
                          </span>
                        </span>
                      </span>
                      <span
                        className="statement-end-if-in-editor"
                        data-type="close"
                      >
                        <span data-custom-class="body_text" />
                      </span>
                    </span>
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_1"
                  id="indemnification"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <strong>
                    <span
                      style={{
                        lineHeight: '115%',
                        fontFamily: 'Arial',
                        fontSize: 19,
                      }}
                    >
                      <strong>
                        <span style={{ lineHeight: '24.5333px', fontSize: 19 }}>
                          <strong>
                            <span
                              style={{
                                lineHeight: '115%',
                                fontFamily: 'Arial',
                                fontSize: 19,
                              }}
                            >
                              <strong>
                                <span
                                  style={{
                                    lineHeight: '115%',
                                    fontFamily: 'Arial',
                                    fontSize: 19,
                                  }}
                                >
                                  25.
                                </span>
                              </strong>
                            </span>
                          </strong>
                        </span>
                        &nbsp;
                      </strong>
                      INDEMNIFICATION
                    </span>
                  </strong>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: 1, textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    You agree to defend, indemnify, and hold us harmless,
                    including our subsidiaries, affiliates, and all of our
                    respective officers, agents, partners, and employees, from
                    and against any loss, damage, liability, claim, or demand,
                    including reasonable attorneys’ fees and expenses, made by
                    any third party due to or arising out of:{' '}
                    <span
                      className="block-container if"
                      data-type="if"
                      id="475fffa5-05ca-def8-ac88-f426b238903c"
                    >
                      <span data-type="conditional-block">
                        <span
                          className="block-component"
                          data-record-question-key="user_post_content_option"
                          data-type="statement"
                        />
                        <span data-type="body">
                          (1) your Contributions;&nbsp;
                        </span>
                      </span>
                      <span
                        className="statement-end-if-in-editor"
                        data-type="close"
                      />
                    </span>
                    (<span style={{ fontSize: '14.6667px' }}>2</span>) use of
                    the Site; (<span style={{ fontSize: '14.6667px' }}>3</span>)
                    breach of these Terms of Use; (
                    <span style={{ fontSize: '14.6667px' }}>4</span>) any breach
                    of your representations and warranties set forth in these
                    Terms of Use; (
                    <span style={{ fontSize: '14.6667px' }}>5</span>) your
                    violation of the rights of a third party, including but not
                    limited to intellectual property rights; or (
                    <span style={{ fontSize: '14.6667px' }}>6</span>) any overt
                    harmful act toward any other user of the Site with whom you
                    connected via the Site. Notwithstanding the foregoing, we
                    reserve the right, at your expense, to assume the exclusive
                    defense and control of any matter for which you are required
                    to indemnify us, and you agree to cooperate, at your
                    expense, with our defense of such claims. We will use
                    reasonable efforts to notify you of any such claim, action,
                    or proceeding which is subject to this indemnification upon
                    becoming aware of it.
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_1"
                  id="userdata"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <strong>
                    <span
                      style={{
                        lineHeight: '115%',
                        fontFamily: 'Arial',
                        fontSize: 19,
                      }}
                    >
                      <strong>
                        <span style={{ lineHeight: '24.5333px', fontSize: 19 }}>
                          <strong>
                            <span
                              style={{
                                lineHeight: '115%',
                                fontFamily: 'Arial',
                                fontSize: 19,
                              }}
                            >
                              <strong>
                                <span
                                  style={{
                                    lineHeight: '115%',
                                    fontFamily: 'Arial',
                                    fontSize: 19,
                                  }}
                                >
                                  26.
                                </span>
                              </strong>
                            </span>
                          </strong>
                        </span>
                        &nbsp;
                      </strong>
                      USER DATA
                    </span>
                  </strong>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: 1, textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    We will maintain certain data that you transmit to the Site
                    for the purpose of managing the performance of the Site, as
                    well as data relating to your use of the Site. Although we
                    perform regular routine backups of data, you are solely
                    responsible for all data that you transmit or that relates
                    to any activity you have undertaken using the Site. You
                    agree that we shall have no liability to you for any loss or
                    corruption of any such data, and you hereby waive any right
                    of action against us arising from any such loss or
                    corruption of such data.
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_1"
                  id="electronic"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <strong>
                    <span
                      style={{
                        lineHeight: '115%',
                        fontFamily: 'Arial',
                        fontSize: 19,
                      }}
                    >
                      <strong>
                        <span style={{ lineHeight: '24.5333px', fontSize: 19 }}>
                          <strong>
                            <span
                              style={{
                                lineHeight: '115%',
                                fontFamily: 'Arial',
                                fontSize: 19,
                              }}
                            >
                              <strong>
                                <span
                                  style={{
                                    lineHeight: '115%',
                                    fontFamily: 'Arial',
                                    fontSize: 19,
                                  }}
                                >
                                  27.
                                </span>
                              </strong>
                            </span>
                          </strong>
                        </span>
                        &nbsp;
                      </strong>
                      ELECTRONIC COMMUNICATIONS, TRANSACTIONS, AND SIGNATURES
                    </span>
                  </strong>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: 1, textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    Visiting the Site, sending us emails, and completing online
                    forms constitute electronic communications. You consent to
                    receive electronic communications, and you agree that all
                    agreements, notices, disclosures, and other communications
                    we provide to you electronically, via email and on the Site,
                    satisfy any legal requirement that such communication be in
                    writing. YOU HEREBY AGREE TO THE USE OF ELECTRONIC
                    SIGNATURES, CONTRACTS, ORDERS, AND OTHER RECORDS, AND TO
                    ELECTRONIC DELIVERY OF NOTICES, POLICIES, AND RECORDS OF
                    TRANSACTIONS INITIATED OR COMPLETED BY US OR VIA THE SITE.
                    You hereby waive any rights or requirements under any
                    statutes, regulations, rules, ordinances, or other laws in
                    any jurisdiction which require an original signature or
                    delivery or retention of non-electronic records, or to
                    payments or the granting of credits by any means other than
                    electronic means.
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span className="block-component" />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_1"
                  id="california"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <strong>
                    <span
                      style={{
                        lineHeight: '115%',
                        fontFamily: 'Arial',
                        fontSize: 19,
                      }}
                    >
                      <strong>
                        <span style={{ lineHeight: '24.5333px', fontSize: 19 }}>
                          <strong>
                            <span
                              style={{
                                lineHeight: '115%',
                                fontFamily: 'Arial',
                                fontSize: 19,
                              }}
                            >
                              <strong>
                                <span
                                  style={{
                                    lineHeight: '115%',
                                    fontFamily: 'Arial',
                                    fontSize: 19,
                                  }}
                                >
                                  28.
                                </span>
                              </strong>
                            </span>
                          </strong>
                        </span>
                        &nbsp;
                      </strong>
                      CALIFORNIA USERS AND RESIDENTS
                    </span>
                  </strong>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: 1, textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    If any complaint with us is not satisfactorily resolved, you
                    can contact the Complaint Assistance Unit of the Division of
                    Consumer Services of the California Department of Consumer
                    Affairs in writing at 1625 North Market Blvd., Suite N 112,
                    Sacramento, California 95834 or by telephone at (800)
                    952-5210 or (916) 445-1254.
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span className="statement-end-if-in-editor" />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_1"
                  id="misc"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <strong>
                    <span
                      style={{
                        lineHeight: '115%',
                        fontFamily: 'Arial',
                        fontSize: 19,
                      }}
                    >
                      <strong>
                        <span style={{ lineHeight: '24.5333px', fontSize: 19 }}>
                          <strong>
                            <span
                              style={{
                                lineHeight: '115%',
                                fontFamily: 'Arial',
                                fontSize: 19,
                              }}
                            >
                              <strong>
                                <span
                                  style={{
                                    lineHeight: '115%',
                                    fontFamily: 'Arial',
                                    fontSize: 19,
                                  }}
                                >
                                  29.
                                </span>
                              </strong>
                            </span>
                          </strong>
                        </span>
                        &nbsp;
                      </strong>
                      MISCELLANEOUS
                    </span>
                  </strong>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: 1, textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    These Terms of Use and any policies or operating rules
                    posted by us on the Site or in respect to the Site
                    constitute the entire agreement and understanding between
                    you and us. Our failure to exercise or enforce any right or
                    provision of these Terms of Use shall not operate as a
                    waiver of such right or provision. These Terms of Use
                    operate to the fullest extent permissible by law. We may
                    assign any or all of our rights and obligations to others at
                    any time. We shall not be responsible or liable for any
                    loss, damage, delay, or failure to act caused by any cause
                    beyond our reasonable control. If any provision or part of a
                    provision of these Terms of Use is determined to be
                    unlawful, void, or unenforceable, that provision or part of
                    the provision is deemed severable from these Terms of Use
                    and does not affect the validity and enforceability of any
                    remaining provisions. There is no joint venture,
                    partnership, employment or agency relationship created
                    between you and us as a result of these Terms of Use or use
                    of the Site. You agree that these Terms of Use will not be
                    construed against us by virtue of having drafted them. You
                    hereby waive any and all defenses you may have based on the
                    electronic form of these Terms of Use and the lack of
                    signing by the parties hereto to execute these Terms of Use.
                    <span className="block-component" />
                  </span>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="heading_1"
                  id="contact"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <strong>
                    <span style={{ lineHeight: '115%', fontFamily: 'Arial' }}>
                      <span style={{ fontSize: 19 }}>
                        <strong>
                          <span
                            style={{ lineHeight: '24.5333px', fontSize: 19 }}
                          >
                            <strong>
                              <span
                                style={{
                                  lineHeight: '115%',
                                  fontFamily: 'Arial',
                                  fontSize: 19,
                                }}
                              >
                                <strong>
                                  <span
                                    style={{
                                      lineHeight: '115%',
                                      fontFamily: 'Arial',
                                      fontSize: 19,
                                    }}
                                  >
                                    30.
                                  </span>
                                </strong>
                              </span>
                            </strong>
                          </span>
                          &nbsp;
                        </strong>
                        CONTACT US
                      </span>
                    </span>
                  </strong>
                </div>
                <div
                  className="MsoNormal"
                  style={{ lineHeight: 1, textAlign: 'left' }}
                >
                  <br />
                </div>
                <div
                  className="MsoNormal"
                  data-custom-class="body_text"
                  style={{ lineHeight: '1.5', textAlign: 'left' }}
                >
                  <span
                    style={{
                      fontSize: '11.0pt',
                      lineHeight: '115%',
                      fontFamily: 'Arial',
                      color: '#595959',
                      msoThemecolor: 'text1',
                      msoThemetint: 166,
                    }}
                  >
                    In order to resolve a complaint regarding the Site or to
                    receive further information regarding use of the Site,
                    please contact us at info@manifold.markets.
                  </span>
                </div>
              </div>
            </div>

            <style
              dangerouslySetInnerHTML={{
                __html:
                  '\n      ul {\n        list-style-type: square;\n      }\n      ul > li > ul {\n        list-style-type: circle;\n      }\n      ul > li > ul > li > ul {\n        list-style-type: square;\n      }\n      ol li {\n        font-family: Arial ;\n      }\n    ',
              }}
            />
          </>
        </Col>
      </Col>
    </Page>
  )
}
