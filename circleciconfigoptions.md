# .circleci config.yml 
# Continuous Integration to a WP Engine install
# PHP CircleCI 2.1 configuration file

# Requirements:
# 1. In CircleCI settings, add environment variables for your site's installs:
#     * WPE_PRODUCTION_INSTALL=thenameofyourproductioninstall
#     * WPE_STAGING_INSTALL=thenameofyourstaginginstall
#     * WPE_DEVELOPMENT_INSTALL=thenameofyourdevelopmentinstall
# 2. In your repo, have two files
#     * `./.gitignores/__default`    -- Excludes any compiled files
#     * `./.gitignores/__deployment` -- Includes all compiled files
# 3. In your package.json file, define scripts:
#     * `lint`,
#     * `visual-regression` (optional)
#     * `build`
#     @link https://yarnpkg.com/lang/en/docs/package-json/#toc-scripts
# 4. Install and configure WP-Browser & Codeception testing suite (optional)
#     @link https://github.com/lucatume/wp-browser
#     @link https://codeception.com

version: 2.1

commands:
    install:
        description:          Installs our code and all dependencies
        parameters:
            no-dev:
                description:  Should composer skip dev requirements?
                type:         boolean
                default:      true
            include-yarn:
                description:  Should yarn install NPM dependencies?
                type:         boolean
                default:      true
            cache-name:
                description:  Specific cache name for different executors
                type:         string
                default:      base
        steps:
            - checkout
            - restore_cache:
                keys:
                    - v1-<< parameters.cache-name >>-dependencies-{{ checksum "package.json" }}-{{ checksum "composer.json" }}
                    - v1-<< parameters.cache-name >>-dependencies-
            - run:
                name:         Install Node Dependencies
                command:      echo "Yarning!\n"; <<# parameters.include-yarn >>yarn<</ parameters.include-yarn >>
            - run:
                name:         Install Composer Dependencies
                command:      composer install <<# parameters.no-dev >>--no-dev<</ parameters.no-dev >> --no-ansi --no-interaction --optimize-autoloader --no-progress --prefer-dist
            - save_cache:
                paths:
                    - ./node_modules
                    - ./vendor
                key:          v1-<< parameters.cache-name >>-dependencies-{{ checksum "package.json" }}-{{ checksum "composer.json" }}

executors:
    base:
        docker:
            - image:          circleci/php:7.2-apache-node-browsers
    wp-browser:
        docker:
            # TODO: Switch to tagged version when stable
            - image:          ryanshoover/wp-browser:latest
              environment:
                DB_USER:      wordpress
                DB_PASSWORD:  wordpress
                DB_NAME:      wordpress
                DB_HOST:      db

            - image:          circleci/mysql:5
              name:           db
              environment:
                MYSQL_ROOT_PASSWORD: password
                MYSQL_DATABASE:      wordpress
                MYSQL_USER:          wordpress
                MYSQL_PASSWORD:      wordpress

jobs:
    lint:
        description:          Lint the files to make sure everything follows best practices
        executor:             base
        steps:
            - install
            - run:
                name:         Run Node test script
                command:      yarn run lint

    codeception:
        description:          Run our codeception tests to make sure code works
        executor:             wp-browser
        working_directory:    /var/www/html

        steps:
            # Install our files and dependencies (get Composer dev dependencies, but no yarn needed)
            - install:
                no-dev:       false
                include-yarn: false
                cache-name:   wp-browser

            - run:
                name:         Make sure WordPress is loaded
                command:      /entrypoint.sh

            # Run the test scripts
            - run:
                name:         Run Codeception acceptance tests
                command:      codecept run acceptance --xml="test-results/acceptance.xml"
            - run:
                name:         Run Codeception functional tests
                command:      codecept run functional --xml="test-results/functional.xml"
            - run:
                name:         Run Codeception unit tests
                command:      codecept run unit --xml="test-results/unit.xml"
            - run:
                name:         Run Codeception wpunit tests
                command:      codecept run wpunit --xml="test-results/wpunit.xml"

            # Open up our test results to CircleCI
            - store_test_results:
                path:         test-results

    visual_regression:
        description:          Run Visual Regression on our staging site
        executor:             base
        steps:
            - install
            - run:
                name:         Visual Regression testing
                command:      yarn run visual-regression
            - store_artifacts:
                path:         /home/circleci/tests
            - store_test_results:
                path:         /home/circleci/tests

    build_deploy:
        description:          Build and deploy our code
        parameters:
            wpe-env:
                description:  Are we deploying to the production, staging, or development environment?
                type:         string
                default:      development
        executor:             base
        steps:
            # Install our files and dependencies
            - install

            # Run the build script defined in our package.json file
            - run:
                name:         Build compiled files
                command:      yarn run build

            # Add the git.wpengine.com fingerprint to our known hosts
            # We need to interact with this server. And the unknown host will trigger an interactive prompt.
            # The workaround is to manually add the fingerprint ourselves.
            # Note:           This will need updated if and when WP Engine updates the fingerprint
            - run:
                name:         Add deploy host to known_hosts
                command:      echo 'git.wpengine.com ssh-rsa AAAAB3NzaC1yc2EAAAABIwAAAQEApRVAUwjz49VKfuENfyv52Dvh3qx9nWW/3Gb7R9pwABXUNQqkipt3aB7w2W6jOaEGFmzSr/4qhstUv0lvbeZu/1uRU/b6WrqULu+9bAdt9ll09QULfMxAIFWDwDS1F6GEZT+Yau/wLUI2VTZppxSVRIPe20/mxgXk8/Q9ha5tCaz+dQZ9lHWwk9rbDF+7LSVomLGM3e9dwr6mS4p37Qkje2cFJBqQcQ+RqEOTOD/xiFU0DH8TWO4R5yibQ0KEZVACkwhaAZSl81F7YZrrLEfsFS/llgpV3YZHQGvFi0x/ELAUJMFE9umdy9EwFF7/lTpV8zOGdiLW+v8svweWJJJ00w==' >> ~/.ssh/known_hosts

            # Set up our WPE_Install based on the environment
            - run:
                name:         Set up the WPE Install name
                command:      |
                              echo 'export WPE_INSTALL=$( \
                                  case << parameters.wpe-env >> in \
                                      production)  echo $WPE_PRODUCTION_INSTALL;; \
                                      staging)     echo $WPE_STAGING_INSTALL;; \
                                      development) echo $WPE_DEVELOPMENT_INSTALL;; \
                                  esac )' >> $BASH_ENV
                              source $BASH_ENV

            # Set up the git remotes for WP Engine
            - run:
                name:         Set up the WP Engine install git remotes
                command:      |
                              git config --global user.email "marketingadmin@wpengine.com"
                              git config --global user.name "WP Engine Marketing"
                              git remote add wpe git@git.wpengine.com:production/${WPE_INSTALL}.git
                              git fetch wpe

            # Swap out our gitignore files, commit the build files, and push to the install
            - deploy:
                name:         Commit build files and push to WPE remote
                command:      |
                              git checkout -b ${CIRCLE_BRANCH}-${CIRCLE_BUILD_NUM}
                              unlink .gitignore; ln -s .gitignores/__deployment .gitignore
                              unlink wp-content/plugins/wpengine-privacy-consent/.gitignore; ln -s wp-content/plugins/wpengine-privacy-consent/.gitignores/__deployment wp-content/plugins/wpengine-privacy-consent/.gitignore
                              unlink wp-content/mu-plugins/wpengine-library/.gitignore; ln -s wp-content/mu-plugins/wpengine-library/.gitignores/__deployment wp-content/mu-plugins/wpengine-library/.gitignore
                              git rm -r -q --cached --ignore-unmatch --force .circleci .github .gitignores composer.* gulpfile.babel.js package.json webpack.config.js yarn.lock .babelrc .editorconfig .eslintignore .eslintrc.json .stylelintrc codeception* tests
                              git add .
                              git commit -m "Deployment commit"
                              git push wpe  ${CIRCLE_BRANCH}-${CIRCLE_BUILD_NUM}
                              git push wpe :${CIRCLE_BRANCH}-${CIRCLE_BUILD_NUM}

            # Notify Rollbar that we've just deployed
            - run:
                name:         Notify Rollbar that we deployed
                command:      |
                              [ -z "$ROLLBAR_ACCESS_TOKEN" ] && exit 0;
                              REVISION=`git log -n 1 --pretty=format:"%H"`
                              curl https://api.rollbar.com/api/1/deploy/ \
                                -F access_token=$ROLLBAR_ACCESS_TOKEN \
                                -F environment=<< parameters.wpe-env >> \
                                -F revision=$REVISION \
                                -F local_username=circleci

workflows:
    version: 2

    build_test_deploy:
        jobs:
            - lint
            - codeception
            - visual_regression:
                filters:
                    branches:
                        only: master

            - build_deploy:
                name:         deploy-development
                wpe-env:      development
                requires:
                    - lint
                    - codeception
                filters:
                    branches:
                        only: development


            - build_deploy:
                name:         deploy-staging
                wpe-env:      staging
                requires:
                    - lint
                    - codeception
                filters:
                    branches:
                        only: staging

            - build_deploy:
                name:         deploy-production
                wpe-env:      production
                requires:
                    - lint
                    - codeception
                    - visual_regression
                filters:
                    branches:
                        only: master
