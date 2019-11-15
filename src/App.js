import React from 'react';
import { Gitgraph, templateExtend } from "@gitgraph/react";

// docs: https://gitgraphjs.com/#5.8

function GitGraphComponent() {
  return (
    <Gitgraph
      options={{
        // mode: 'compact',
        orientation: 'vertical-reverse',
        template: templateExtend(
          "metro", 
          {
            colors: [
              "#7B7B7B", // master
              "#EDB803", // hotfix
              "#6F9CD7", // staging
              "#415E85", // release
              "#C74943", // feature
              // "#01345C", // disabled develop branch
            ],
          commit: {
            message: {
              displayAuthor: false,
              displayHash: false,
            },
          },
        }),
      }}
    >
      {(gitgraph) => {
        // Simulate git commands with Gitgraph API.
        const masterProduction = gitgraph.branch("master/production");
        masterProduction.commit("Initial commit");

        // const develop = gitgraph.branch("develop");
        const staging = gitgraph.branch("staging");
        const feature = gitgraph.branch("feature");

        const release = gitgraph.branch("release");

        masterProduction.commit("A bug (which was previously commited)");
        const hotfix = gitgraph.branch("hotfix");
        hotfix.commit("hotfix/fixing live site");
        staging.merge("hotfix").tag('Test hotfix using staging')
        staging.commit("CircleCi tests run on hotfix")

        // Possibly add release into current release to test it here
        // release.merge("hotfix").tag('Merge the hotfix into release, so that it\'s tested with current features')
        // release.commit("CircleCI tests run")

        masterProduction.merge("hotfix")

        release.commit("Beatles Sprint").tag('start of Beatles sprint')

        feature
          .commit("Write specs - BDD (Behaviour Driven Development)")
          .commit("Write tests - TDD Test Driven Development")
          .commit("Make it work, make it right, make it fast")
        feature.commit("") // this fixes a bug in the git graph

        // develop.merge(feature);
        // develop.commit("CircleCI tests rerun")

        staging.merge(feature)
        staging.commit("CircleCI tests run with staging code");

        release.merge(feature).tag('Create Pull Request for release')
        release.commit("CircleCI tests run on all release code");

        release.merge(masterProduction).tag("ensure release includes hotfixes from master / production");
        release.commit("CircleCI tests run on all code").tag("End of Sprint");

        masterProduction.merge(release).commit('Create Pull Request to go live');
      }}
    </Gitgraph>
  );
}

function App() {
  return (
    <div className="App">
        <GitGraphComponent />
    </div>
  );
}

export default App;
